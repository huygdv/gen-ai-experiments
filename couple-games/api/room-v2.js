import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import crypto from 'node:crypto';

const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const TOKEN = /^[a-f0-9]{32,64}$/i;
const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_EVENT = 160;
const pathFor = code => `couplegames/rooms-v2/${code}.json`;
const json = (res,status,data)=>res.status(status).json(data);
const nameOf = name => String(name || '').trim().slice(0,18) || 'Người chơi';

async function load(code) {
  const blob = await get(pathFor(code), { access:'private', useCache:false });
  if (!blob) return null;
  const room = await new Response(blob.stream).json();
  const etag=blob.blob?.etag||blob.etag; if(!etag)throw Error('Blob ETag unavailable'); return {room,etag};
}
async function change(code,op) {
  for (let i=0;i<10;i++) {
    const record=await load(code);
    if (!record) return {status:404,error:'Phòng không tồn tại hoặc đã hết hạn.'};
    const r=record.room;
    if (Date.now()-r.created>TTL_MS) return {status:410,error:'Phòng đã hết hạn. Hãy tạo phòng mới.'};
    const answer=op(r);
    if (answer?.error) return answer;
    try {
      await put(pathFor(code), JSON.stringify(r), {access:'private',contentType:'application/json',allowOverwrite:true,ifMatch:record.etag});
      return answer||{ok:true};
    } catch(e) {
      if (!(e instanceof BlobPreconditionFailedError) && e.name!=='BlobPreconditionFailedError') throw e;
    }
  }
  return {status:409,error:'Phòng đang bận cập nhật. Thử lại.'};
}
function validKey(r,key){return r.hostKey===key?'host':r.guestKey===key?'guest':null;}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!process.env.BLOB_READ_WRITE_TOKEN) return json(res,503,{error:'Máy chủ phòng chưa có kho dữ liệu.'});
  if(req.method!=='GET'&&req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  const b=req.method==='POST'?(typeof req.body==='object'&&req.body?req.body:JSON.parse(req.body||'{}')):req.query;
  const code=String(b.code||'').trim().toUpperCase(), key=String(b.key||'');
  if(!CODE.test(code)) return json(res,400,{error:'Mã phòng phải gồm 6 ký tự.'});
  try {
    if(req.method==='GET') {
      if(!TOKEN.test(key)) return json(res,401,{error:'Phiên đăng nhập phòng không hợp lệ.'});
      const data=await load(code);
      if(!data||Date.now()-data.room.created>TTL_MS) return json(res,404,{error:'Phòng không tồn tại hoặc đã hết hạn.'});
      const r=data.room,role=validKey(r,key);
      if(!role)return json(res,403,{error:'Bạn không thuộc phòng này.'});
      const since=Math.max(0,Number(b.since)||0);
      return json(res,200,{ok:true,role,room:code,guestName:r.guestName||null,guestOnline:!!r.guestKey&&Date.now()-r.guestSeen<45000,hostOnline:Date.now()-r.hostSeen<45000,snapshot:role==='guest'?r.snapshot:null,version:r.version||0,events:role==='host'?r.events.filter(e=>e.seq>since&&e.from==='guest'):[],cursor:r.nextSeq||0,serverTime:Date.now()});
    }
    if(JSON.stringify(b).length>30000)return json(res,413,{error:'Dữ liệu phòng quá lớn.'});
    if(b.action==='create'){
      if(!TOKEN.test(key)) return json(res,400,{error:'Mã phiên không hợp lệ.'});
      const now=Date.now(),room={code,hostKey:key,guestKey:null,hostName:nameOf(b.name),guestName:null,hostSeen:now,guestSeen:0,created:now,variant:b.variant==='battle'?'battle':'classic',nextSeq:0,events:[],snapshot:null,version:0};
      try {await put(pathFor(code),JSON.stringify(room),{access:'private',contentType:'application/json',ttlDays:1});return json(res,200,{ok:true,room:code});}
      catch(e){if(String(e.name).includes('AlreadyExists')||String(e.message).includes('already exists'))return json(res,409,{error:'Mã phòng bị trùng. Hãy tạo lại.'});throw e;}
    }
    if(!TOKEN.test(key))return json(res,401,{error:'Mã phiên không hợp lệ.'});
    const action=String(b.action||'');
    const result=await change(code,r=>{
      const now=Date.now(),role=validKey(r,key);
      if(action==='join'){
        if(r.guestKey&&r.guestKey!==key&&now-r.guestSeen<45000)return {status:409,error:'Phòng đã có đủ hai người chơi.'};
        r.guestKey=key;r.guestName=nameOf(b.name);r.guestSeen=now;
        return {ok:true,role:'guest',room:code};
      }
      if(!role)return {status:403,error:'Bạn không thuộc phòng này.'};
      if(action==='ping'){
        if(role==='host')r.hostSeen=now;else r.guestSeen=now;
        return {ok:true};
      }
      if(action==='snapshot'){
        if(role!=='host')return {status:403,error:'Chỉ chủ phòng có thể cập nhật trạng thái.'};
        const snap=b.snapshot;
        if(!snap||!['lobby','countdown','playing','resolving','finished'].includes(snap.phase)||!Array.isArray(snap.claims)||snap.claims.length!==101)return {status:400,error:'Trạng thái game không hợp lệ.'};
        r.snapshot=snap;r.version++;r.hostSeen=now;
        return {ok:true,version:r.version};
      }
      if(action==='event'){
        if(role!=='guest')return {status:403,error:'Chỉ người tham gia có thể gửi sự kiện.'};
        const msg=b.message;
        if(!msg||!['claim','hello','restart-request'].includes(msg.type))return {status:400,error:'Loại sự kiện không hợp lệ.'};
        if(msg.type==='claim'&&(!Number.isInteger(msg.number)||msg.number<1||msg.number>100))return {status:400,error:'Số không hợp lệ.'};
        r.nextSeq++;r.events.push({seq:r.nextSeq,from:'guest',message:msg});
        if(r.events.length>MAX_EVENT)r.events=r.events.slice(-MAX_EVENT);
        r.guestSeen=now;return {ok:true,seq:r.nextSeq};
      }
      if(action==='leave'){
        if(role==='guest'){r.guestKey=null;r.guestName=null;r.guestSeen=0;}else r.hostSeen=0;
        return {ok:true};
      }
      return {status:400,error:'Hành động không được hỗ trợ.'};
    });
    return json(res,result?.status||200,result?.status?{error:result.error}:result);
  }catch(e){console.error('couplegames room api',e?.name,e?.message);return json(res,503,{error:'Máy chủ phòng đang bận. Thử lại trong giây lát.'});}
}
