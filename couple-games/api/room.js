import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const TTL=2*60*60*1000;
const path=code=>'couplegames/rooms-v4/'+code+'.json';
const hash=s=>createHash('sha256').update(String(s)).digest('hex');
const nick=s=>String(s||'').trim().replace(/[<>]/g,'').slice(0,20)||'Người chơi';
const send=(res,status,data)=>{if(status===200&&data?.room)data.room.serverTime=Date.now();return res.status(status).json(data);};
const code6=()=>Array.from(randomBytes(6),b=>ALPHABET[b%ALPHABET.length]).join('');
const token=()=>randomUUID()+randomUUID();
const pause=ms=>new Promise(done=>setTimeout(done,ms));

async function read(code){
  const blob=await get(path(code),{access:'private',useCache:false});
  if(!blob)return null;
  const room=JSON.parse(await new Response(blob.stream).text());
  return {room,etag:blob.blob.etag};
}
function authorized(room,key){
  if(typeof key!=='string'||key.length<20||key.length>100)return null;
  const signature=hash(key);
  if(signature===room.hostHash)return {host:true,id:room.hostRole==='spectator'?0:1};
  const p=room.players.find(p=>p.keyHash===signature);
  return p?{host:false,id:p.id}:null;
}
function advance(room,now){
  if(room.variant!=='battle'||!room.battle||!['playing','draining'].includes(room.phase))return;
  const b=room.battle;
  let at=Math.max(b.tickAt,room.startsAt);
  let end=Math.max(at,Math.min(now,at+120000));
  let steps=0;
  while(at<end&&steps++<1000){
    const dt=Math.min(.2,(end-at)/1000);at+=dt*1000;
    for(const u of b.units)u.pos+=(u.owner===1?1:-1)*u.speed*dt;
    const dead=new Set();
    for(let i=0;i<b.units.length;i++){
      const a=b.units[i];if(dead.has(a.id))continue;
      for(let j=i+1;j<b.units.length;j++){
        const c=b.units[j];if(dead.has(c.id)||a.owner===c.owner||a.lane!==c.lane||Math.abs(a.pos-c.pos)>.05)continue;
        a.hp--;c.hp--;b.collisions++;
        if(a.hp<=0)dead.add(a.id);
        if(c.hp<=0)dead.add(c.id);
        if(dead.has(a.id))break;
      }
    }
    b.units=b.units.filter(u=>!dead.has(u.id));
    const escaped=new Set();
    for(const u of b.units){
      if((u.owner===1&&u.pos>=1)||(u.owner===2&&u.pos<=0)){
        b.hp[u.owner===1?1:0]=Math.max(0,b.hp[u.owner===1?1:0]-u.damage);
        escaped.add(u.id);
      }
    }
    if(escaped.size)b.units=b.units.filter(u=>!escaped.has(u.id));
    if(b.hp[0]<=0||b.hp[1]<=0){room.phase='finished';room.winner=b.hp[0]===b.hp[1]?0:b.hp[0]>b.hp[1]?1:2;break;}
  }
  b.tickAt=at;
  if(room.phase==='draining'&&!b.units.length){
    room.phase='finished';
    room.winner=b.hp[0]===b.hp[1]
      ?(room.scores[0]===room.scores[1]?0:room.scores[0]>room.scores[1]?1:2)
      :b.hp[0]>b.hp[1]?1:2;
  }
}
function publicRoom(room,now){
  const copy=JSON.parse(JSON.stringify(room));
  advance(copy,now);
  return {code:copy.code,phase:copy.phase,variant:copy.variant,hostRole:copy.hostRole,
    maxPlayers:copy.maxPlayers,players:copy.players.map(({id,name})=>({id,name})),
    seed:copy.seed,startsAt:copy.startsAt,round:copy.round,
    claims:copy.claims,current:copy.current,scores:copy.scores,winner:copy.winner||0,
    battle:copy.battle,updatedAt:copy.updatedAt,version:copy.version};
}
function spawn(room,owner,number){
  const b=room.battle; if(!b)return;
  b.streak=b.streakOwner===owner?b.streak+1:1;b.streakOwner=owner;
  const heavy=b.streak%4===0;
  b.units.push({id:b.nextId++,owner,lane:number%3,pos:owner===1?0:1,
    hp:heavy?2:1,damage:heavy?18:10,speed:heavy?.092:.118});
}
async function transact(code,handler){
  for(let i=0;i<8;i++){
    const record=await read(code);
    if(!record)return {status:404,error:'Phòng chưa tồn tại hoặc đã hết hạn.'};
    const r=record.room,now=Date.now();
    if(now-r.createdAt>TTL)return {status:410,error:'Phòng đã hết hạn. Hãy tạo phòng mới.'};
    const result=handler(r,now)||{};
    if(result.error)return {status:result.status||400,error:result.error,body:result.body};
    r.version++;r.updatedAt=now;
    try{
      await put(path(code),JSON.stringify(r),{access:'private',addRandomSuffix:false,
        allowOverwrite:true,ifMatch:record.etag,contentType:'application/json',ttlDays:1});
      return {status:200,body:result.body||{ok:true,room:publicRoom(r,Date.now())}};
    }catch(e){
      if(e instanceof BlobPreconditionFailedError||/precondition|etag|412/i.test(String(e.message))){
        await pause(10+i*20);continue;
      }
      throw e;
    }
  }
  return {status:409,error:'Hai người thao tác cùng lúc. Thử lại trong giây lát.'};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET')return send(res,200,{ok:true,version:'0.4.1',storage:!!process.env.BLOB_READ_WRITE_TOKEN});
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'Máy chủ chưa có kho dữ liệu phòng.'});
  let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch(e){return send(res,400,{error:'Dữ liệu không hợp lệ.'});}
  if(JSON.stringify(data).length>4096)return send(res,413,{error:'Yêu cầu quá lớn.'});
  try{
    const action=String(data.action||'');
    if(action==='create'){
      const hostRole=data.hostRole==='spectator'?'spectator':'player';
      const variant=data.variant==='battle'?'battle':'classic';
      const credential=token();
      for(let i=0;i<7;i++){
        const code=code6(),now=Date.now();
        const room={code,createdAt:now,updatedAt:now,version:1,round:1,phase:'lobby',
          variant,hostRole,hostHash:hash(credential),
          maxPlayers:hostRole==='spectator'?2:variant==='battle'?2:3,
          players:hostRole==='player'?[{id:1,name:nick(data.name),keyHash:hash(credential)}]:[],
          seed:0,startsAt:0,current:1,claims:Array(101).fill(0),scores:[0,0,0],winner:0,battle:null};
        try{
          await put(path(code),JSON.stringify(room),{access:'private',addRandomSuffix:false,
            allowOverwrite:false,contentType:'application/json',ttlDays:1});
          return send(res,200,{ok:true,code,token:credential,role:'host',playerId:hostRole==='spectator'?0:1,room:publicRoom(room,now)});
        }catch(e){if(/already exists|conflict|409/i.test(String(e.message)))continue;throw e;}
      }
      return send(res,503,{error:'Chưa tạo được mã phòng. Thử lại nhé.'});
    }
    const code=String(data.code||'').trim().toUpperCase();
    if(!CODE.test(code))return send(res,400,{error:'Mã phòng phải có 6 ký tự A–Z, 2–9.'});
    if(action==='join'){
      const credential=token();
      const result=await transact(code,(r,now)=>{
        if(r.phase!=='lobby')return {status:409,error:'Trận đã bắt đầu; không thể vào thêm người.'};
        if(r.players.length>=r.maxPlayers)return {status:409,error:'Phòng đã đủ người chơi.'};
        const id=r.players.length+1;
        r.players.push({id,name:nick(data.name),keyHash:hash(credential)});
        return {body:{ok:true,role:'player',token:credential,playerId:id,room:publicRoom(r,now)}};
      });
      return send(res,result.status,result.error?{error:result.error}:result.body);
    }
    const credential=String(data.token||'');
    if(action==='state'){
      const record=await read(code);
      if(!record)return send(res,404,{error:'Phòng chưa tồn tại hoặc đã hết hạn.'});
      if(Date.now()-record.room.createdAt>TTL)return send(res,410,{error:'Phòng đã hết hạn.'});
      const role=authorized(record.room,credential);
      if(!role)return send(res,403,{error:'Không có quyền truy cập phòng này.'});
      return send(res,200,{ok:true,role:role.host?'host':'player',playerId:role.id,room:publicRoom(record.room,Date.now())});
    }
    if(!['start','restart','claim'].includes(action))return send(res,400,{error:'Lệnh không hợp lệ.'});
    const result=await transact(code,(r,now)=>{
      const who=authorized(r,credential);
      if(!who)return {status:403,error:'Phiên phòng không hợp lệ.'};
      if(action==='start'||action==='restart'){
        if(!who.host)return {status:403,error:'Chỉ chủ phòng có thể bắt đầu.'};
        if(r.players.length<2)return {status:409,error:'Cần ít nhất 2 người chơi mới bắt đầu.'};
        if(r.variant==='battle'&&r.players.length!==2)return {status:409,error:'Gián Bom chỉ hỗ trợ 2 người chơi.'};
        r.phase='playing';r.round+=action==='restart'?1:0;
        r.seed=randomBytes(4).readUInt32LE(0);r.startsAt=now+2500;
        r.current=1;r.claims=Array(101).fill(0);r.scores=[0,0,0];r.winner=0;
        r.battle=r.variant==='battle'?{hp:[100,100],units:[],nextId:1,streakOwner:0,streak:0,collisions:0,tickAt:r.startsAt}:null;
        return {};
      }
      if(!who.id)return {status:403,error:'Khán giả không thể khoanh số.'};
      if(r.phase!=='playing'||now<r.startsAt)return {status:409,error:'Trận chưa bắt đầu hoặc đã kết thúc.'};
      if(r.variant==='battle')advance(r,now);
      if(r.phase!=='playing')return {status:409,error:'Trận đã kết thúc.'};
      const number=Number(data.number);
      if(!Number.isInteger(number)||number!==r.current)
        return {status:409,error:'Số này đã có người khoanh trước.',body:{room:publicRoom(r,now)}};
      r.claims[number]=who.id;r.scores[who.id-1]++;r.current++;
      if(r.variant==='battle')spawn(r,who.id,number);
      if(r.current===101){
        if(r.variant==='battle')r.phase='draining';
        else{
          r.phase='finished';
          const max=Math.max(...r.scores.slice(0,r.players.length));
          const winners=r.players.filter(p=>r.scores[p.id-1]===max);
          r.winner=winners.length===1?winners[0].id:0;
        }
      }
      return {};
    });
    return send(res,result.status,result.error?{error:result.error,...(result.body||{})}:result.body);
  }catch(e){
    console.error('couplegames-room',e?.name,e?.message);
    return send(res,503,{error:'Kết nối máy chủ phòng gặp sự cố. Hãy thử lại.'});
  }
}
