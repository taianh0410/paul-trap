'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const app = express();
const tlsKey=process.env.TLS_KEY, tlsCert=process.env.TLS_CERT;
const tlsEnabled=!!(tlsKey&&tlsCert);
const server = tlsEnabled ? require('https').createServer({key:fs.readFileSync(tlsKey),cert:fs.readFileSync(tlsCert)},app) : http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const ion = io.of('/ion-trap');
const PORT = Number(process.env.PORT) || 3000;
const EMA_ALPHA = 0.4;
const rooms = new Map();
const validRoom = id => typeof id === 'string' && /^[A-Z0-9]{4,8}$/.test(id);
const normalizeRoom = id => typeof id === 'string' ? id.trim().toUpperCase() : '';
const cleanAngle = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 180;
const stateView = room => ({ roomId:room.id, status:room.status, stage:room.stage, displayConnected:!!room.display, mobileConnected:!!room.mobile, ready:room.ready, reason:room.reason || '', result:room.result || null });
function emitState(room) { ion.to(room.id).emit('room_state', stateView(room)); }
function makeRoom() { let id; do { id=crypto.randomBytes(3).toString('hex').toUpperCase(); } while(rooms.has(id)); const room={id,status:'WAITING',stage:0,display:null,mobile:null,ready:false,reason:'',result:null,ema:null,timer:null,epoch:0}; rooms.set(id,room); return room; }
function stopTimer(room) { if(room.timer) clearTimeout(room.timer); room.timer=null; room.epoch++; }
function resetRoom(room) {stopTimer(room); room.status='WAITING'; room.stage=0; room.ready=false; room.reason=''; room.result=null; room.ema=null; emitState(room);}
function leave(socket) { const id=socket.data.roomId; if(!id) return; const room=rooms.get(id); socket.leave(id); socket.data.roomId=null; if(!room) return; if(room.display===socket.id){room.display=null; stopTimer(room); room.status='WAITING'; room.ready=false; room.reason='Màn hình đã ngắt kết nối';} if(room.mobile===socket.id){room.mobile=null; room.ready=false; room.ema=null; if(room.status==='PLAYING'||room.status==='COUNTDOWN'){stopTimer(room);room.status='PAUSED';room.reason='Điện thoại mất kết nối';}} emitState(room); if(!room.display && !room.mobile){stopTimer(room);rooms.delete(id);} }
function startCountdown(room) { if(room.status!=='WAITING'&&room.status!=='PAUSED') return; if(!room.display||!room.mobile||!room.ready)return; stopTimer(room); room.status='COUNTDOWN';room.reason='';emitState(room);const epoch=room.epoch; let remaining=3; ion.to(room.id).emit('countdown',{remaining}); const tick=()=>{if(room.epoch!==epoch)return;remaining--;if(remaining===0){room.status='PLAYING';room.stage=1;room.timer=null;emitState(room);ion.to(room.id).emit('game_started',{stage:1});return;}ion.to(room.id).emit('countdown',{remaining});room.timer=setTimeout(tick,1000);};room.timer=setTimeout(tick,1000);}
function stageClear(room, stage) {if(room.status!=='PLAYING'||room.stage!==stage)return;room.status='STAGE_CLEAR';room.result={stage};room.reason='';emitState(room);ion.to(room.id).emit('stage_clear',{stage});}
function finish(room, outcome, reason) {if(!['PLAYING','STAGE_CLEAR','PAUSED'].includes(room.status))return;stopTimer(room);room.status=outcome;room.reason=typeof reason==='string'?reason.slice(0,160):'';room.ready=false;emitState(room);ion.to(room.id).emit(outcome==='VICTORY'?'victory':'game_over',{reason:room.reason,stage:room.stage});}
ion.on('connection', socket => {
  socket.on('create_room', (_, ack) => {if(socket.data.roomId)leave(socket);const room=makeRoom();room.display=socket.id;socket.data.roomId=room.id;socket.data.role='display';socket.join(room.id);ack?.({ok:true,roomId:room.id,state:stateView(room)});emitState(room);});
  socket.on('join_room', (id, ack) => {id=normalizeRoom(id);const room=rooms.get(id);if(!validRoom(id)||!room){ack?.({ok:false,error:'Mã phòng không hợp lệ hoặc đã hết hạn'});return;}if(room.mobile && room.mobile!==socket.id){ack?.({ok:false,error:'Phòng đã có điện thoại điều khiển'});return;}if(socket.data.roomId&&socket.data.roomId!==id)leave(socket);socket.join(id);socket.data.roomId=id;socket.data.role='mobile';room.mobile=socket.id;room.ready=false;room.ema=null;if(room.status==='PAUSED')room.status='WAITING';ack?.({ok:true,roomId:id,state:stateView(room)});socket.emit('room_joined',{roomId:id});emitState(room);});
  socket.on('player_ready', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.mobile!==socket.id){ack?.({ok:false,error:'Bạn chưa tham gia phòng'});return;}if(room.status!=='WAITING'&&room.status!=='PAUSED'){ack?.({ok:false,error:'Không thể READY ở trạng thái này'});return;}room.ready=true;room.reason='';emitState(room);ack?.({ok:true});});
  socket.on('start_game', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id){ack?.({ok:false,error:'Chỉ màn hình chính được bắt đầu'});return;}if(!room.mobile||!room.ready||!['WAITING','PAUSED'].includes(room.status)){ack?.({ok:false,error:'Chờ điện thoại kết nối và nhấn SẴN SÀNG'});return;}startCountdown(room);ack?.({ok:true});});
  socket.on('sensor_data', (payload,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.mobile!==socket.id||room.status!=='PLAYING')return;if(!payload||normalizeRoom(payload.roomId)!==room.id||!cleanAngle(payload.beta)||!cleanAngle(payload.gamma))return;const now=Date.now();if(socket.data.lastSensor && now-socket.data.lastSensor<8)return;socket.data.lastSensor=now;const beta=Math.max(-45,Math.min(45,payload.beta));const gamma=Math.max(-45,Math.min(45,payload.gamma));room.ema={beta:room.ema?EMA_ALPHA*beta+(1-EMA_ALPHA)*room.ema.beta:beta,gamma:room.ema?EMA_ALPHA*gamma+(1-EMA_ALPHA)*room.ema.gamma:gamma};ion.to(room.id).emit('sync_data',{...room.ema});});
  socket.on('stage_complete', ({stage}={},ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id||room.status!=='PLAYING'||stage!==room.stage){ack?.({ok:false});return;}stageClear(room,stage);ack?.({ok:true});});
  socket.on('next_stage', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id||room.status!=='STAGE_CLEAR'||room.stage>=7){ack?.({ok:false});return;}room.stage++;room.status='PLAYING';room.result=null;emitState(room);ion.to(room.id).emit('stage_started',{stage:room.stage});ack?.({ok:true});});
  socket.on('claim_reward', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id||room.status!=='STAGE_CLEAR'){ack?.({ok:false});return;}finish(room,'VICTORY',`Đã nhận quà ở thập kỷ ${room.stage}`);ack?.({ok:true});});
  socket.on('game_over', ({reason}={},ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id||room.status!=='PLAYING'){ack?.({ok:false});return;}finish(room,'GAME_OVER',reason||'Hạt thoát khỏi bẫy');ack?.({ok:true});});
  socket.on('victory', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id||room.status!=='STAGE_CLEAR'||room.stage!==7){ack?.({ok:false});return;}finish(room,'VICTORY','Hoàn thành cả 7 thập kỷ');ack?.({ok:true});});
  socket.on('reset_game', (_,ack)=>{const room=rooms.get(socket.data.roomId);if(!room||room.display!==socket.id){ack?.({ok:false});return;}resetRoom(room);ack?.({ok:true});});
  socket.on('disconnect',()=>leave(socket));
});
app.get('/qr', async(req,res)=>{const room=normalizeRoom(req.query.room);if(!validRoom(room)||!rooms.has(room))return res.status(404).end();let host=req.get('host');if(/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)){const interfaces=Object.values(os.networkInterfaces()).flat();const local=interfaces.find(i=>i.family==='IPv4'&&!i.internal);if(local)host=local.address+(PORT===80||PORT===443?'':':'+PORT);}const protocol=tlsEnabled?'https':(req.get('x-forwarded-proto')||req.protocol).split(',')[0];const url=`${protocol}://${host}/mobile?room=${encodeURIComponent(room)}`;res.type('svg');res.send(await QRCode.toString(url,{type:'svg',margin:1,color:{dark:'#071d2d',light:'#ffffffff'}}));});

const admin = io.of('/admin');
const adminToken=process.env.ADMIN_TOKEN;
const safeToken=(provided)=>typeof provided==='string'&&typeof adminToken==='string'&&adminToken.length>=12&&provided.length===adminToken.length&&crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(adminToken));
function adminSnapshot(){return [...rooms.values()].map(stateView);}
admin.use((socket,next)=>{if(!safeToken(socket.handshake.auth?.token))return next(new Error('Admin chưa cấu hình hoặc token không hợp lệ'));next();});
admin.on('connection',socket=>{
  socket.emit('rooms',adminSnapshot());
  socket.on('list_rooms',(_,ack)=>ack?.({ok:true,rooms:adminSnapshot()}));
  socket.on('admin_action',({roomId,action}={},ack)=>{
    const room=rooms.get(normalizeRoom(roomId));if(!room){ack?.({ok:false,error:'Không tìm thấy phòng'});return;}
    if(action==='reset')resetRoom(room);
    else if(action==='fail')finish(room,'GAME_OVER','Quản trị viên kết thúc lượt chơi');
    else if(action==='complete'&&room.status==='PLAYING')stageClear(room,room.stage);
    else if(action==='next'&&room.status==='STAGE_CLEAR'&&room.stage<7){room.stage++;room.status='PLAYING';room.result=null;emitState(room);ion.to(room.id).emit('stage_started',{stage:room.stage});}
    else if(action==='victory'&&room.status==='STAGE_CLEAR'&&room.stage===7)finish(room,'VICTORY','Hoàn thành cả 7 thập kỷ');
    else{ack?.({ok:false,error:'Thao tác không hợp lệ trong trạng thái hiện tại'});return;}
    ack?.({ok:true,rooms:adminSnapshot()});admin.emit('rooms',adminSnapshot());
  });
});
app.use(express.static(path.join(__dirname,'public'),{index:'index.html'}));
app.get('/mobile',(_req,res)=>res.sendFile(path.join(__dirname,'public','mobile.html')));
app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/health',(_req,res)=>res.json({status:'ok',rooms:rooms.size}));
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`Paul Trap: ${tlsEnabled?'https':'http'}://localhost:${PORT}`));
module.exports={app,server,io,rooms,makeRoom,resetRoom,validRoom};
