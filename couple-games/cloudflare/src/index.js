import { DurableObject } from 'cloudflare:workers';
import { ALPHABET, ROOM_RE, createRoom, roleOf, snapshot, transition } from './engine.js';

const MAX_BODY=4096;
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const code6=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>ALPHABET[b%ALPHABET.length]).join('');
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
const fail=(status,code,message)=>reply({ok:false,error:message,code},status);
async function read(req){
  if(Number(req.headers.get('content-length'))>MAX_BODY)throw Error('TOO_LARGE');
  const text=await req.text();
  if(text.length>MAX_BODY)throw Error('TOO_LARGE');
  return JSON.parse(text||'{}');
}
const validToken=t=>typeof t==='string'&&t.length>=64&&t.length<=100;
async function sha256(input){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function socketSend(socket,data){try{socket.send(JSON.stringify(data));}catch(_){}}

export class CoupleRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;}
  async fetch(req){
    const path=new URL(req.url).pathname;
    if(path==='/socket')return this.socket(req);
    let body;
    try{body=await read(req);}catch(_){return fail(400,'BAD_JSON','Nội dung không hợp lệ');}
    if(path==='/create'){
      if(await this.ctx.storage.get('room'))return fail(409,'CODE_TAKEN','Mã đã tồn tại');
      const room=createRoom({code:body.code,name:body.name,hostRole:body.hostRole,tokenHash:body.tokenHash,now:Date.now()});
      await this.ctx.storage.put('room',room);
      await this.ctx.storage.setAlarm(room.expiresAt);
      return reply({ok:true,room:snapshot(room)});
    }
    if(path==='/join')return this.respond(await this.mutate(null,'join',body));
    if(path==='/state'){
      if(!validToken(body.token))return fail(403,'AUTH','Phiên không hợp lệ');
      const room=await this.ctx.storage.get('room');
      if(!room||room.phase==='closed'||Date.now()>=room.expiresAt)return fail(410,'CLOSED','Phòng đã đóng');
      const role=roleOf(room,await sha256(body.token));
      if(!role)return fail(403,'AUTH','Bạn không còn trong phòng');
      return reply({ok:true,role:role.role,playerId:role.id,room:snapshot(room)});
    }
    if(path==='/action'){
      if(!validToken(body.token))return fail(403,'AUTH','Phiên không hợp lệ');
      const action=body.action==='restart'?'rematch':body.action;
      const input=action==='kick'?{...body,id:body.playerId}:body;
      return this.respond(await this.mutate(await sha256(body.token),action,input));
    }
    return fail(404,'NOT_FOUND','Không tìm thấy API');
  }
  respond(out){
    if(out.error)return fail(out.error.status,out.error.code,out.error.message);
    return reply({ok:true,room:snapshot(out.room),event:out.event,
      ...(out.event.type==='player.joined'?{playerId:out.event.id}:{})});
  }
  async mutate(hash,action,data){
    const result=await this.ctx.storage.transaction(async tx=>{
      const room=await tx.get('room');
      if(!room)return {error:{status:404,code:'MISSING',message:'Mã phòng không tồn tại'}};
      const actor=action==='join'?{role:'guest',id:0}:roleOf(room,hash);
      const out=transition(room,actor,action,data);
      if(out.error)return out;
      await tx.put('room',room);
      return out;
    });
    if(!result.error){
      const payload={type:'room.event',event:result.event,room:snapshot(result.room)};
      for(const ws of this.ctx.getWebSockets()){
        const attachment=ws.deserializeAttachment();
        if(!attachment?.hash)continue;
        socketSend(ws,payload);
        if(result.room.phase==='closed'||!roleOf(result.room,attachment.hash)){
          try{ws.close(4003,result.room.phase==='closed'?'Room closed':'Session revoked');}catch(_){}
        }
      }
    }
    return result;
  }
  async socket(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
      return fail(426,'UPGRADE','Cần WebSocket upgrade');
    const room=await this.ctx.storage.get('room');
    if(!room||room.phase==='closed'||Date.now()>=room.expiresAt)
      return fail(410,'CLOSED','Phòng đã đóng');
    if(this.ctx.getWebSockets().length>=16)return fail(429,'SOCKET_CAP','Phòng có quá nhiều kết nối mở');
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({hash:null,latestClientSeq:0});
    socketSend(server,{type:'hello.required',version:1,serverTime:Date.now()});
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    if(typeof raw!=='string'||raw.length>MAX_BODY){ws.close(1009,'Payload too large');return;}
    let msg;try{msg=JSON.parse(raw);}catch(_){ws.close(1003,'Invalid JSON');return;}
    const session=ws.deserializeAttachment()||{};
    if(!session.hash){
      if(msg.type!=='hello'||!validToken(msg.token)){ws.close(4003,'Auth required');return;}
      const room=await this.ctx.storage.get('room');
      const hash=await sha256(msg.token),actor=room&&room.phase!=='closed'&&Date.now()<room.expiresAt?roleOf(room,hash):null;
      if(!actor){ws.close(4003,'Invalid session');return;}
      ws.serializeAttachment({hash,latestClientSeq:0});
      socketSend(ws,{type:'room.snapshot',role:actor.role,playerId:actor.id,room:snapshot(room)});
      return;
    }
    if(msg.type==='ping'){
      const now=Date.now();
      if(now-(session.lastPingAt||0)<2000)return;
      ws.serializeAttachment({...session,lastPingAt:now});
      socketSend(ws,{type:'pong',seq:msg.seq||0,serverTime:now});return;
    }
    if(msg.type!=='action'){socketSend(ws,{type:'action.rejected',code:'UNKNOWN_ACTION'});return;}
    const clientSeq=Number(msg.clientSeq);
    if(!Number.isSafeInteger(clientSeq)||clientSeq<=session.latestClientSeq){
      socketSend(ws,{type:'action.rejected',code:'DUPLICATE',clientSeq});return;
    }
    const now=Date.now();
    const credit=Math.min(12,(session.credit??12)+(Math.max(0,now-(session.lastInputAt||now))*.012));
    if(credit<1){socketSend(ws,{type:'action.rejected',code:'RATE_LIMIT',clientSeq,message:'Thao tác quá nhanh'});return;}
    ws.serializeAttachment({...session,latestClientSeq:clientSeq,credit:credit-1,lastInputAt:now});
    const action=String(msg.action||'');
    if(!['claim','emote','leave','close','lock','kick','start','rematch'].includes(action)){
      socketSend(ws,{type:'action.rejected',code:'INVALID_ACTION',clientSeq});return;
    }
    const data=action==='kick'?{...(msg.data||{}),id:msg.data?.playerId}:msg.data||{};
    const out=await this.mutate(session.hash,action,data);
    if(out.error)socketSend(ws,{type:'action.rejected',clientSeq,...out.error});
    else socketSend(ws,{type:'action.ack',clientSeq,serverSeq:out.event.seq});
  }
  webSocketClose(){/* Network loss does not forfeit a seat. */}
  webSocketError(){}
  async alarm(){
    const room=await this.ctx.storage.get('room');
    if(room&&Date.now()<room.expiresAt){await this.ctx.storage.setAlarm(room.expiresAt);return;}
    for(const ws of this.ctx.getWebSockets())try{ws.close(4004,'Room expired');}catch(_){}
    await this.ctx.storage.delete('room');
  }
}
const stub=(env,code)=>env.ROOMS.get(env.ROOMS.idFromName(code));
const internal=(target,path,body)=>target.fetch(new Request('https://internal/'+path,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
}));
const ROUTER = {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin')||'';
    const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
    if(origin&&origin!==url.origin&&origin!==allowed)return fail(403,'ORIGIN','Origin không được phép');
    const cors=origin===allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}:{};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(url.pathname==='/api/health')return reply({ok:true,service:'couplegames',backend:'cloudflare-do',version:'0.5.0'});
    if(url.pathname==='/api/room'&&request.method==='GET')return reply({ok:true,version:'0.5.0',storage:'durable-objects'});
    if(url.pathname==='/api/ws'){
      const code=(url.searchParams.get('room')||'').toUpperCase();
      if(!ROOM_RE.test(code))return fail(400,'INVALID_CODE','Mã phòng cần 6 ký tự');
      // Socket authenticates through the first HELLO message. No token in URL.
      return stub(env,code).fetch(new Request('https://internal/socket',{headers:request.headers}));
    }
    if(url.pathname==='/api/room'&&request.method==='POST'){
      let data;try{data=await read(request);}catch(_){return fail(400,'INVALID_JSON','Dữ liệu không hợp lệ');}
      if(data.action==='create'){
        if(data.variant&&data.variant!=='classic')return fail(400,'UNSUPPORTED','Gián Bom chưa được chuyển sang backend mới');
        for(let i=0;i<7;i++){
          const code=code6(),credential=token(),hash=await sha256(credential);
          const response=await internal(stub(env,code),'create',{code,tokenHash:hash,name:data.name,hostRole:data.hostRole});
          if(response.status===409)continue;
          if(!response.ok)return response;
          const result=await response.json();
          return reply({ok:true,code,token:credential,role:'host',playerId:data.hostRole==='spectator'?0:1,room:result.room});
        }
        return fail(503,'COLLISION','Không tạo được phòng');
      }
      const code=String(data.code||'').toUpperCase();
      if(!ROOM_RE.test(code))return fail(400,'INVALID_CODE','Mã phòng cần 6 ký tự');
      if(data.action==='join'){
        const credential=token(),hash=await sha256(credential);
        const response=await internal(stub(env,code),'join',{name:data.name,tokenHash:hash});
        if(!response.ok)return response;
        const result=await response.json();
        return reply({ok:true,code,token:credential,role:'player',playerId:result.playerId,room:result.room});
      }
      if(!validToken(data.token))return fail(403,'AUTH','Token không hợp lệ');
      return internal(stub(env,code),data.action==='state'?'state':'action',data);
    }
    if(env.ASSETS)return env.ASSETS.fetch(request);
    return fail(404,'NOT_FOUND','Không tìm thấy đường dẫn');
  }
};

// One explicit Vercel origin may call the same API; browser tokens are not in URLs.
export default {
 async fetch(request,env){
  const response=await ROUTER.fetch(request,env);
  if(response.status===101)return response;
  const origin=request.headers.get('Origin')||'';
  if(origin&&origin===String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'')){
   const headers=new Headers(response.headers);
   headers.set('Access-Control-Allow-Origin',origin);
   headers.set('Access-Control-Allow-Headers','Content-Type');
   headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
   headers.set('Vary','Origin');
   return new Response(response.body,{status:response.status,headers});
  }
  return response;
 }
};
