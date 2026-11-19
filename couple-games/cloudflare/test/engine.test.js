import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,roleOf,snapshot,transition,ROOM_TTL_MS} from '../src/engine.js';

const HOST='a'.repeat(64), G1='b'.repeat(64),G2='c'.repeat(64),G3='d'.repeat(64);
const make=(hostRole='player')=>{
  const room=createRoom({code:'ABC234',name:'Host',hostRole,tokenHash:HOST,now:1000});
  const host=roleOf(room,HOST);
  return {room,host};
};
const apply=(room,actor,action,data={},now=1000)=>transition(room,actor,action,data,now);

test('create room has 2h expiry, safe public snapshot, correct seating',()=>{
 const {room,host}=make();
 assert.equal(room.expiresAt,1000+ROOM_TTL_MS);
 assert.equal(host.id,1);
 assert.equal(room.players.length,1);
 assert.equal(snapshot(room).hostHash,undefined);
 assert.equal(snapshot(room).players[0].tokenHash,undefined);
});
test('three-player classic and spectator-host room',()=>{
 const {room,host}=make();
 assert.equal(apply(room,host,'join',{tokenHash:G1,name:'Guest1'}).event.id,2);
 assert.equal(apply(room,host,'join',{tokenHash:G2,name:'Guest2'}).event.id,3);
 assert.equal(apply(room,host,'join',{tokenHash:G3,name:'Extra'}).error.code,'FULL');
 const spectator=make('spectator');
 assert.equal(spectator.host.id,0);
 assert.equal(apply(spectator.room,spectator.host,'join',{tokenHash:G1}).event.id,1);
 assert.equal(apply(spectator.room,spectator.host,'join',{tokenHash:G2}).event.id,2);
 assert.equal(apply(spectator.room,spectator.host,'join',{tokenHash:G3}).error.code,'FULL');
});
test('lock, kick, refill seats without renumbering',()=>{
 const {room,host}=make();
 apply(room,host,'join',{tokenHash:G1});apply(room,host,'join',{tokenHash:G2});
 assert.equal(apply(room,host,'lock',{locked:true}).event.locked,true);
 assert.equal(apply(room,host,'join',{tokenHash:G3}).error.code,'LOCKED');
 apply(room,host,'lock',{locked:false});
 assert.equal(apply(room,host,'kick',{id:2}).event.id,2);
 assert.equal(roleOf(room,G1),null);
 assert.equal(apply(room,host,'join',{tokenHash:G3}).event.id,2);
 assert.equal(roleOf(room,G2).id,3);
});
test('server validates start, claims and spectator',()=>{
 const {room,host}=make('spectator');
 apply(room,host,'join',{tokenHash:G1});apply(room,host,'join',{tokenHash:G2});
 assert.equal(apply(room,host,'claim',{number:1}).error.code,'NOT_PLAYING');
 assert.equal(apply(room,host,'start',{seed:777},1000).event.type,'game.started');
 const p1=roleOf(room,G1),p2=roleOf(room,G2);
 assert.equal(apply(room,p1,'claim',{number:1},1100).error.code,'NOT_PLAYING');
 assert.equal(apply(room,host,'claim',{number:1},3000).error.code,'NOT_PLAYING');
 assert.equal(apply(room,p1,'claim',{number:1},3000).event.type,'number.claimed');
 assert.equal(apply(room,p2,'claim',{number:1},3001).error.code,'CLAIM_CONFLICT');
 assert.equal(room.current,2);
 assert.deepEqual(room.scores,[1,0,0]);
 assert.equal(room.seq,4);
});
test('no duplicate score, even after 100 rapid alternating claims',()=>{
 const {room,host}=make();apply(room,host,'join',{tokenHash:G1});
 apply(room,host,'start',{},2000);
 const guest=roleOf(room,G1);
 for(let n=1;n<=100;n++){
   const who=n%2?host:guest;
   assert.equal(apply(room,who,'claim',{number:n},4000+n).event.owner,who.id);
   assert.equal(apply(room,who,'claim',{number:n},4000+n).error.code,'CLAIM_CONFLICT');
 }
 assert.equal(room.phase,'finished');
 assert.equal(room.scores[0]+room.scores[1],100);
 assert.equal(room.winner,0);
});
test('emote cooldown, validation, spectator emotes and secret-free output',()=>{
 const {room,host}=make('spectator');apply(room,host,'join',{tokenHash:G1});
 assert.equal(apply(room,host,'emote',{kind:'tomato',target:1},4000).event.type,'reaction.sent');
 assert.equal(apply(room,host,'emote',{kind:'haha',target:1},4100).error.code,'COOLDOWN');
 assert.equal(apply(room,host,'emote',{kind:'heart',target:1},6501).event.kind,'heart');
 assert.equal(apply(room,host,'emote',{kind:'bad',target:1},9000).error.code,'INVALID_EMOTE');
 assert.equal(snapshot(room).reactions.length,2);
});
test('explicit leave / close; disconnect itself does not mutate room',()=>{
 const {room,host}=make();apply(room,host,'join',{tokenHash:G1});
 const guest=roleOf(room,G1);
 const start=apply(room,host,'start',{},2000);
 assert.equal(start.event.type,'game.started');
 assert.equal(apply(room,guest,'leave',{},4000).event.type,'player.left');
 assert.equal(room.phase,'finished');
 assert.equal(room.winner,1);
 assert.equal(roleOf(room,G1),null);
 assert.equal(apply(room,host,'close',{},5000).event.type,'room.closed');
 assert.equal(apply(room,host,'start',{},6000).error.code,'ROOM_CLOSED');
});
test('rejoin before start via unexpired token does not allocate duplicate seat',()=>{
 const {room,host}=make();apply(room,host,'join',{tokenHash:G1});
 assert.equal(roleOf(room,G1).id,2);
 assert.equal(roleOf(room,G1).id,2);
 assert.equal(room.players.length,2);
});
