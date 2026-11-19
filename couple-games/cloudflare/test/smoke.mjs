#!/usr/bin/env node
// Local / staging smoke test for authoritative CoupleGames classic rooms.
// Usage: npm run test:smoke (start 'npm run dev' in another terminal)
//        BASE_URL=https://your-worker.workers.dev npm run test:smoke
// No credentials are printed or committed. Node >=22 with native WebSocket.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const BASE=(process.env.BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const TIMEOUT=12000;
const url=new URL(BASE);
const socketBase=(url.protocol==='https:'?'wss:':'ws:')+'//'+url.host;
const messages=[];
const stats=[];
let wsClients=[];

async function post(input){
 const t=performance.now();
 const ctrl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),TIMEOUT);
 try{
  const response=await fetch(BASE+'/api/room',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(input),signal:ctrl.signal
  });
  const body=await response.json();
  stats.push({name:input.action,status:response.status,ms:Math.round(performance.now()-t)});
  return {status:response.status,...body};
 }finally{clearTimeout(timer);}
}
function waitFor(promise,description,timeoutMs=TIMEOUT){
 return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timeout: '+description)),timeoutMs))]);
}
async function connect(room,token,label){
 const ws=new WebSocket(socketBase+'/api/ws?room='+encodeURIComponent(room));
 wsClients.push(ws);
 const history=[];
 const hello=waitFor(new Promise((resolve,reject)=>{
  ws.addEventListener('message',event=>{
   let m;try{m=JSON.parse(String(event.data));}catch(e){reject(e);return;}
   history.push(m);messages.push({label,...m});
   if(m.type==='hello.required')ws.send(JSON.stringify({type:'hello',token}));
   if(m.type==='room.snapshot')resolve(m);
  });
  ws.addEventListener('error',()=>reject(new Error('Socket error: '+label)),{once:true});
  ws.addEventListener('close',event=>{if(!history.some(m=>m.type==='room.snapshot'))reject(new Error('Closed before auth: '+label+' '+event.code));},{once:true});
 }),label+' hello');
 await hello;
 return {ws,history,label,hello};
}
async function received(client,match,description,timeoutMs=TIMEOUT){
 const found=client.history.find(match);if(found)return found;
 return waitFor(new Promise(resolve=>{
  const timer=setInterval(()=>{const matchItem=client.history.find(match);
   if(matchItem){clearInterval(timer);resolve(matchItem);}
  },10);
 }),description,timeoutMs);
}
function assertStatus(result,status,message){assert.equal(result.status,status,message+': '+(result.error||JSON.stringify(result).slice(0,120)));}
async function run(){
 const health=await fetch(BASE+'/api/health').then(r=>r.json());
 assert.equal(health.backend,'cloudflare-do');
 const host=await post({action:'create',name:'Smoke Host',hostRole:'spectator',variant:'classic'});
 assertStatus(host,200,'create room');
 const a=await post({action:'join',code:host.code,name:'Smoke A'});
 const b=await post({action:'join',code:host.code,name:'Smoke B'});
 assertStatus(a,200,'join A');assertStatus(b,200,'join B');
 assert.deepEqual([a.playerId,b.playerId],[1,2]);
 const [ca,cb,ch]=await Promise.all([
  connect(host.code,a.token,'A'),connect(host.code,b.token,'B'),connect(host.code,host.token,'spectator')
 ]);
 const begun=await post({action:'start',code:host.code,token:host.token});
 assertStatus(begun,200,'start');
 await Promise.all([ca,cb,ch].map(c=>received(c,m=>m.type==='room.event'&&m.event?.type==='game.started',c.label+' start broadcast')));
 const delay=Math.max(0,begun.room.startsAt-Date.now()+40);
 await new Promise(resolve=>setTimeout(resolve,delay));
 const t=performance.now();
 ca.ws.send(JSON.stringify({type:'action',clientSeq:1,action:'claim',data:{number:1}}));
 const emits=await Promise.all([ca,cb,ch].map(c=>received(c,m=>m.type==='room.event'&&m.event?.type==='number.claimed'&&m.event.number===1,c.label+' claim broadcast')));
 const remoteMs=Math.round(performance.now()-t);
 assert.equal(emits[1].event.owner,1);
 const confirmed=await post({action:'state',code:host.code,token:b.token});
 assertStatus(confirmed,200,'state read');
 assert.equal(confirmed.room.current,2);assert.equal(confirmed.room.scores[0],1);
 const conflict=await post({action:'claim',code:host.code,token:b.token,number:1});
 assertStatus(conflict,409,'duplicate claim rejected');
 const emote=await post({action:'emote',code:host.code,token:host.token,kind:'tomato',target:1});
 const cooldown=await post({action:'emote',code:host.code,token:host.token,kind:'haha',target:1});
 assertStatus(emote,200,'emote');assertStatus(cooldown,429,'emote cooldown');
 const closed=await post({action:'close',code:host.code,token:host.token});
 assertStatus(closed,200,'close room');
 const late=await post({action:'join',code:host.code,name:'Late'});
 assertStatus(late,410,'closed room rejects join');
 const sorted=stats.map(s=>s.ms).sort((x,y)=>x-y);
 console.log(JSON.stringify({
  pass:true,environment:BASE,roomRedacted:true,clients:3,transport:'websocket',
  checks:['create','join x2','spectator socket','broadcast x3','claim race','emote cooldown','close room'],
  localOrNetworkPushMs:remoteMs,httpMedianMs:sorted[Math.floor(sorted.length/2)],
  note:'This is one scripted environment, not independent-network p95.'
 },null,2));
}
run().catch(error=>{console.error('SMOKE FAIL',error.message);process.exitCode=1;}).finally(()=>{
 for(const ws of wsClients){try{ws.close();}catch(e){}}
});
