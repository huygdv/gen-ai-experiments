/* CoupleGames room transport v0.3.2: first-party Vercel API, replaces PeerJS Cloud. */
(function(){
'use strict';
const API='/api/room-v2';
class Events {
  constructor(){this.listeners={};}
  on(type,fn){(this.listeners[type]??=[]).push(fn);return this;}
  emit(type,...args){for(const fn of this.listeners[type]||[]){try{fn(...args);}catch(e){console.error('[CoupleGames]',e);}}}
}
const token=()=>{let bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
async function callRoom(data,method='POST'){
  let ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);
  try {
    const url=method==='GET'?API+'?'+new URLSearchParams(data):API;
    const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(data),cache:'no-store',signal:ctl.signal});
    let body;try{body=await response.json();}catch(e){throw new Error('Server trả dữ liệu không hợp lệ ('+response.status+').');}
    if(!response.ok||!body.ok){let e=new Error(body.error||'HTTP '+response.status);e.status=response.status;throw e;}return body;
  } finally { clearTimeout(timer); }
}
class DataConnection extends Events {
  constructor(peer){super();this.peer=peer;this.open=false;this.closed=false;}
  _open(){if(this.closed||this.open)return;this.open=true;this.emit('open');}
  send(message){if(!this.open||this.closed)return;this.peer._send(message);}
  close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');}
}
class Peer extends Events {
  constructor(id){
    super();
    this.id=id||'coupleguest-'+Math.random().toString(36).slice(2);
    this.host=!!id;this.room=this.host?String(id).replace(/^couple-sanso-v1-/,'').toUpperCase():'';
    this.key=token();this.open=false;this.destroyed=false;this.disconnected=false;this.conn=null;this.pollTimer=null;this.pingTimer=null;this.lastVersion=-1;this.cursor=0;this.inFlight=false;this.pendingSnapshot=null;this.flushTimer=null;this.lastSend=0;this.queue=[];this.sending=false;this.lastError=0;
    if(this.host)this._create();
    else queueMicrotask(()=>{if(this.destroyed)return;this.open=true;this.emit('open',this.id);});
  }
  _emitError(e,kind){if(this.destroyed)return;const err=new Error(e?.message||'Kết nối lỗi');err.type=kind||'network';this.emit('error',err);}
  async _create(){
    try{await callRoom({action:'create',code:this.room,key:this.key,name:'Chủ phòng'});if(this.destroyed)return;this.open=true;this._start();this.emit('open',this.id);}
    catch(e){this._emitError(e,e.status===409?'unavailable-id':'server-error');}
  }
  connect(hostId){
    const code=String(hostId||'').replace(/^couple-sanso-v1-/,'').toUpperCase();
    const conn=new DataConnection(this);this.room=code;this.conn=conn;
    (async()=>{try{await callRoom({action:'join',code,key:this.key,name:'Người ấy'});if(this.destroyed||conn.closed)return;this._start();conn._open();}
      catch(e){this._emitError(e,e.status===404?'peer-unavailable':'server-error');conn.emit('error',e);}})();
    return conn;
  }
  _start(){
    clearInterval(this.pollTimer);clearInterval(this.pingTimer);
    this.pollTimer=setInterval(()=>this._poll(),700);
    this.pingTimer=setInterval(()=>{if(!this.destroyed)callRoom({action:'ping',code:this.room,key:this.key}).catch(()=>{});},12000);
    setTimeout(()=>this._poll(),80);
  }
  async _poll(){
    if(this.destroyed||this.inFlight||!this.room)return;
    this.inFlight=true;
    try{
      const data=await callRoom({code:this.room,key:this.key,since:String(this.cursor)},'GET');
      if(this.destroyed)return;
      if(this.host){
        if(data.guestOnline){
          if(!this.conn||this.conn.closed){const conn=new DataConnection(this);this.conn=conn;this.emit('connection',conn);queueMicrotask(()=>conn._open());}
          const incoming=(data.events||[]).filter(e=>e.message).map(e=>e.message);if(this.conn){const conn=this.conn;queueMicrotask(()=>{if(conn.open&&!conn.closed)for(const message of incoming)conn.emit('data',message);});}
        } else if(this.conn&&!this.conn.closed){this.conn.close();this.conn=null;}
        this.cursor=Math.max(this.cursor,data.cursor||0);
      } else {
        if(data.snapshot&&data.version>this.lastVersion){this.lastVersion=data.version;if(this.conn?.open)this.conn.emit('data',data.snapshot);}
        if(!data.hostOnline&&this.conn?.open&&Date.now()-this.lastError>20000){this.lastError=Date.now();this.emit('disconnected');}
      }
    }catch(e){if(Date.now()-this.lastError>12000){this.lastError=Date.now();console.warn('[CoupleGames] Room polling:',e.message);}}
    finally{this.inFlight=false;}
  }
  _send(msg){
    if(!msg||typeof msg!=='object'||this.destroyed)return;
    if(msg.type==='snapshot'){
      this.pendingSnapshot=msg;
      if(!this.flushTimer)this.flushTimer=setTimeout(()=>{this.flushTimer=null;const snap=this.pendingSnapshot;this.pendingSnapshot=null;if(snap&&!this.destroyed){this.queue=this.queue.filter(x=>x.action!=='snapshot');this.queue.push({action:'snapshot',snapshot:snap});this._drain();}},480);
      return;
    }
    if(['claim','hello','restart-request'].includes(msg.type)){this.queue.push({action:'event',message:msg});this._drain();}
  }
  async _drain(){
    if(this.sending||this.destroyed)return;this.sending=true;
    try{while(this.queue.length&&!this.destroyed){const task=this.queue.shift();let ok=false;for(let i=0;i<3&&!ok;i++){try{await callRoom({code:this.room,key:this.key,...task});ok=true;}catch(e){if(i<2)await new Promise(r=>setTimeout(r,300*(i+1)));else{console.warn('[CoupleGames] send failed',e.message);this._emitError(e,'network');}}}}}
    finally{this.sending=false;}
  }
  reconnect(){this.disconnected=false;if(!this.destroyed&&this.room)this._poll();}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.open=false;clearInterval(this.pollTimer);clearInterval(this.pingTimer);clearTimeout(this.flushTimer);this.conn?.close();if(this.room)callRoom({action:'leave',code:this.room,key:this.key}).catch(()=>{});}
}
window.Peer=Peer;window.__coupleRoomTransport='vercel-api-v1';
})();