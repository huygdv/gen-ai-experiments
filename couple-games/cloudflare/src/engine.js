// CoupleGames Cloudflare MVP — deterministic room rules, no Cloudflare dependency.
// One room = one SQLite-backed Durable Object. Server is authoritative.
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
export function createRoom({code, name, hostRole = 'player', tokenHash, now}) {
  const spectator = hostRole === 'spectator';
  return {
    code, gameId:'san-so', variant:'classic', phase:'lobby', hostRole: spectator?'spectator':'player',
    hostHash:tokenHash, createdAt:now, expiresAt:now+ROOM_TTL_MS,
    players:spectator?[]:[{id:1, name:cleanName(name), tokenHash, left:false}],
    maxPlayers:spectator?2:3, locked:false, round:0, version:1, seq:0,
    startsAt:0, seed:0, current:1, claims:Array(101).fill(0),scores:[0,0,0], winner:0,
    reactions:[], emoteAt:{}, lastActionAt:now,
  };
}
export function cleanName(value) {
  return String(value||'').trim().replace(/[<>\\]/g,'').slice(0,20)||'Người chơi';
}
export function roleOf(room, hash) {
  if (!hash) return null;
  if (room.hostHash === hash) return { role:'host', id:room.hostRole==='spectator'?0:1 };
  const player=room.players.find(p=>p.tokenHash===hash&&!p.left);
  return player?{role:'player',id:player.id}:null;
}
export function snapshot(room) {
  return {
    code:room.code, gameId:room.gameId, variant:room.variant, phase:room.phase,
    hostRole:room.hostRole, players:room.players.map(({id,name,left})=>({id,name,left:!!left})),
    maxPlayers:room.maxPlayers, locked:room.locked, round:room.round, version:room.version, seq:room.seq,
    startsAt:room.startsAt, seed:room.seed, current:room.current, claims:room.claims,
    scores:room.scores, winner:room.winner, reactions:room.reactions.slice(-10),
    expiresAt:room.expiresAt, serverTime:Date.now(),
  };
}
function err(status, code, message) { return {error:{status,code,message}}; }
function ok(type, payload={}) { return { type, ...payload }; }
export function transition(room, actor, action, data={}, now=Date.now()) {
  if (now >= room.expiresAt || room.phase==='closed') return err(410,'ROOM_CLOSED','Phòng đã đóng hoặc hết hạn');
  if (!actor) return err(403,'FORBIDDEN','Bạn không còn quyền trong phòng');
  const host=actor.role==='host';
  let result;
  switch(action) {
    case 'join': {
      if (room.phase!=='lobby') return err(409,'STARTED','Trận đã bắt đầu');
      if (room.locked) return err(409,'LOCKED','Chủ phòng đã khóa phòng');
      if (room.players.length>=room.maxPlayers) return err(409,'FULL','Phòng đã đủ người');
      const tokenHash=data.tokenHash;
      if (!tokenHash || !/^[0-9a-f]{64}$/.test(tokenHash)) return err(400,'INVALID','Token đăng nhập không hợp lệ');
      const taken=new Set(room.players.map(p=>p.id));
      const id=Array.from({length:room.maxPlayers},(_,i)=>i+1).find(i=>!taken.has(i));
      room.players.push({id,name:cleanName(data.name),tokenHash,left:false});
      room.players.sort((a,b)=>a.id-b.id);
      result=ok('player.joined',{id,name:cleanName(data.name)});break;
    }
    case 'lock': {
      if (!host || room.phase!=='lobby') return err(403,'FORBIDDEN','Chỉ chủ phòng được khóa khi đang chờ');
      room.locked=!!data.locked;
      result=ok('room.locked',{locked:room.locked});break;
    }
    case 'kick': {
      if (!host || room.phase!=='lobby') return err(403,'FORBIDDEN','Chỉ chủ phòng được mời người ra trước trận');
      const id=Number(data.id);
      if (!Number.isInteger(id)||id<1||(room.hostRole==='player'&&id===1)) return err(400,'INVALID','Không thể mời chủ phòng ra');
      const found=room.players.find(p=>p.id===id);
      if (!found) return err(404,'NOT_FOUND','Không tìm thấy người chơi');
      room.players=room.players.filter(p=>p.id!==id);
      result=ok('player.kicked',{id});break;
    }
    case 'leave': {
      if (host) {
        room.phase='closed';
        result=ok('room.closed');
      } else {
        const id=actor.id;
        if (room.phase==='lobby') room.players=room.players.filter(p=>p.id!==id);
        else {
          const p=room.players.find(p=>p.id===id);
          if (p) {p.left=true;p.tokenHash=null;}
          if (room.phase==='playing') {
            const active=room.players.filter(p=>!p.left);
            if(active.length<=1){room.phase='finished';room.winner=active[0]?.id||0;}
          }
        }
        result=ok('player.left',{id});
      }
      break;
    }
    case 'close': {
      if (!host) return err(403,'FORBIDDEN','Chỉ chủ phòng có thể đóng phòng');
      room.phase='closed';result=ok('room.closed');break;
    }
    case 'start': {
      if (!host||room.phase!=='lobby') return err(403,'FORBIDDEN','Chỉ chủ phòng được bắt đầu');
      if(room.players.length<2) return err(409,'MIN_PLAYERS','Cần ít nhất 2 người chơi');
      room.phase='playing';room.round+=1;room.current=1;room.claims=Array(101).fill(0);
      room.scores=[0,0,0];room.winner=0;room.reactions=[];
      room.startsAt=now+1500;room.seed=Number(data.seed)||now%4294967296;
      result=ok('game.started',{round:room.round,startsAt:room.startsAt,seed:room.seed});break;
    }
    case 'rematch': {
      if (!host||room.phase!=='finished') return err(403,'FORBIDDEN','Chỉ chủ phòng được chơi lại sau khi kết thúc');
      if(room.players.some(p=>p.left))return err(409,'SEAT_LEFT','Có người rời trận; cần tạo phòng mới');
      room.phase='playing';room.round+=1;room.current=1;room.claims=Array(101).fill(0);
      room.scores=[0,0,0];room.winner=0;room.reactions=[];
      room.startsAt=now+1500;room.seed=Number(data.seed)||now%4294967296;
      result=ok('game.started',{round:room.round,startsAt:room.startsAt,seed:room.seed});break;
    }
    case 'claim': {
      if (!actor.id||room.phase!=='playing'||now<room.startsAt)return err(409,'NOT_PLAYING','Trận chưa sẵn sàng');
      if(room.players.find(p=>p.id===actor.id)?.left)return err(403,'LEFT','Người chơi đã rời trận');
      const number=Number(data.number);
      if(!Number.isInteger(number)||number<1||number>100)return err(400,'INVALID','Số phải từ 1 đến 100');
      if(number!==room.current)return err(409,'CLAIM_CONFLICT','Số này đã bị khoanh hoặc chưa đến lượt');
      room.claims[number]=actor.id;room.scores[actor.id-1]++;room.current++;
      result=ok('number.claimed',{number,owner:actor.id,next:room.current,scores:[...room.scores]});
      if (room.current>100) {
        const max=Math.max(...room.players.filter(p=>!p.left).map(p=>room.scores[p.id-1]));
        const winner=room.players.filter(p=>!p.left&&room.scores[p.id-1]===max);
        room.phase='finished';room.winner=winner.length===1?winner[0].id:0;
        result.finished={winner:room.winner};
      }
      break;
    }
    case 'emote': {
      const kind=String(data.kind||''),target=Number(data.target);
      if(!['haha','tomato','heart'].includes(kind)) return err(400,'INVALID_EMOTE','Biểu cảm không hợp lệ');
      if(!Number.isInteger(target)||!room.players.some(p=>p.id===target&&!p.left)||target===actor.id)
        return err(400,'INVALID_TARGET','Chọn một đối thủ hợp lệ');
      const key=String(actor.id||'host');
      if(now-(room.emoteAt[key]||0)<2500)return err(429,'COOLDOWN','Mỗi biểu cảm cách nhau 2,5 giây');
      room.emoteAt[key]=now;
      room.reactions=room.reactions.filter(e=>now-e.at<12000).slice(-9);
      const event={from:actor.id,to:target,kind,at:now,round:room.round};
      room.reactions.push(event);
      result=ok('reaction.sent',event);break;
    }
    default: return err(400,'UNKNOWN_ACTION','Lệnh không được hỗ trợ');
  }
  room.seq++;room.version++;room.lastActionAt=now;
  return {event:{...result,seq:room.seq,version:room.version,at:now},room};
}
