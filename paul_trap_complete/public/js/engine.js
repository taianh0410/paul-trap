/* Reworked from the team's IonTrapPhysicsEngine: consistent 20s stages, moving attractors, fixed-step physics. */
(function(global){
'use strict';
const STAGES=[
 {years:'1956–1966',name:'KHỞI NGUYÊN',subtitle:'Nền móng · Dao động điều hòa',color:'#42c8ff',noise:110,friction:.85,impulse:0},
 {years:'1966–1976',name:'KHÁNG CHIẾN',subtitle:'Xung lực · Phản xạ',color:'#ff537b',noise:120,friction:.80,impulse:.015,shockMin:2200,shockMax:3600},
 {years:'1976–1986',name:'TÁI THIẾT',subtitle:'Không gian ít ma sát',color:'#4de5df',noise:100,friction:.995,impulse:0},
 {years:'1986–1996',name:'ĐỔI MỚI',subtitle:'Khối lượng biến thiên',color:'#ffd166',noise:110,friction:.85,mass:true,bohr:true},
 {years:'1996–2006',name:'HỘI NHẬP',subtitle:'Các điểm hấp dẫn di động',color:'#b68cff',noise:110,friction:.82,attractors:true,blackHoleRadius:24,blackHoleStrength:280000},
 {years:'2006–2016',name:'VƯƠN TẦM',subtitle:'Xoay hệ tọa độ',color:'#ff81c5',noise:120,friction:.82,rotation:true,rotationSpeed:.02},
 {years:'2016–2026',name:'CHUYỂN ĐỔI SỐ',subtitle:'Hỗn loạn lượng tử',color:'#a8ff78',noise:160,friction:.995,impulse:.02,shockMin:2200,shockMax:3600,mass:true,bohr:true,rotation:true,rotationSpeed:.045,attractors:true,blackHoleRadius:36,blackHoleStrength:450000}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class IonTrapPhysicsEngine{
 constructor(){this.radius=260;this.reset();}
 reset(){
  this.stage=1;this.t=0;this.x=0;this.y=0;this.vx=0;this.vy=0;
  this.beta=0;this.gamma=0;this.inputX=0;this.inputY=0;
  this.trail=[];this.shock=0;this.shockAngle=0;this.dead=false;
  this.bohrLevel=1;this.mass=1;this.bohrTimer=0;this.rotationAngle=0;
  this.afkTimer=0;this.afkWarnings=0;this.lastInputX=0;this.lastInputY=0;
 }
 startStage(n){
  this.stage=clamp(n,1,7);this.t=0;this.dead=false;
  this.x=0;this.y=0;this.vx=0;this.vy=0;this.trail=[];
  this.shock=0;this.bohrTimer=0;this.bohrLevel=1;this.mass=1;
  this.rotationAngle=0;this.afkTimer=0;this.afkWarnings=0;
  this.lastInputX=this.gamma/30;this.lastInputY=this.beta/30;
  const c=this.config;
  const minR=c.attractors?c.blackHoleRadius+35:this.radius*.2;
  const maxR=this.radius*.55;
  const r=minR+Math.random()*Math.max(0,maxR-minR);
  const a=Math.random()*Math.PI*2;
  this.x=r*Math.cos(a);this.y=r*Math.sin(a);
 }
 handleSocketSyncData(beta,gamma){
  if(!Number.isFinite(beta)||!Number.isFinite(gamma))return;
  this.beta=clamp(beta,-45,45);this.gamma=clamp(gamma,-45,45);
 }
 get config(){return STAGES[this.stage-1];}
 get attractors(){
  // Match the supplied reference engine: a central black hole in stages 5 and 7.
  return this.config.attractors?[{x:0,y:0,r:this.config.blackHoleRadius}]:[];
 }
 update(dt){
  if(this.dead)return null;
  dt=clamp(dt,0,1/30);this.t+=dt;
  const c=this.config;
  const targetX=clamp(this.gamma/30,-1,1);
  const targetY=clamp(this.beta/30,-1,1);
  const delta=Math.hypot(targetX-this.lastInputX,targetY-this.lastInputY);
  if(delta<.018){
   this.afkTimer+=dt;
   if(this.afkTimer>=3){
    this.afkTimer=0;this.afkWarnings++;
    if(this.afkWarnings>=3){this.dead=true;return 'afk';}
    return 'afk_warning';
   }
  }else{
   this.afkTimer=0;this.lastInputX=targetX;this.lastInputY=targetY;
  }
  // Reference smoothing is 0.25 per 60 Hz frame.
  const blend=1-Math.pow(.75,dt*60);
  this.inputX+=(targetX-this.inputX)*blend;
  this.inputY+=(targetY-this.inputY)*blend;
  if(c.bohr){
   this.bohrTimer+=dt;
   if(this.bohrTimer>=2){this.bohrTimer=0;this.bohrLevel=Math.floor(Math.random()*10)+1;}
  }else{this.bohrLevel=1;this.bohrTimer=0;}
  this.mass=c.mass ? (0.2+this.bohrLevel/10*1.8) : 1;
  let centrifugalX=0,centrifugalY=0;
  if(c.rotation){
   const speed=c.rotationSpeed+this.t*.0025;
   this.rotationAngle+=speed*dt*60;
   const d=Math.hypot(this.x,this.y);
   if(d>0){
    const magnitude=this.mass*Math.pow(speed*12,2)*d*.75;
    centrifugalX=this.x/d*magnitude;centrifugalY=this.y/d*magnitude;
   }
  }else this.rotationAngle=0;
  const cr=Math.cos(this.rotationAngle),sr=Math.sin(this.rotationAngle);
  let fx=(this.inputX*cr-this.inputY*sr)*650;
  let fy=(this.inputX*sr+this.inputY*cr)*650;
  const noiseTime=this.t*2;
  fx+=Math.sin(noiseTime)*c.noise+Math.cos(noiseTime*1.7)*50;
  fy+=Math.cos(noiseTime*1.3)*c.noise+Math.sin(noiseTime*2.1)*50;
  let event=null;
  // Convert reference per-frame shock probability to a time-step-independent one.
  if(c.impulse&&this.shock<=0&&Math.random()<1-Math.pow(1-c.impulse,dt*60)){
   this.shock=.15;this.shockAngle=Math.random()*Math.PI*2;
   this.shockForce=c.shockMin+Math.random()*(c.shockMax-c.shockMin);
   event='shock';
  }
  if(this.shock>0){
   this.shock=Math.max(0,this.shock-dt);
   fx+=Math.cos(this.shockAngle)*this.shockForce;
   fy+=Math.sin(this.shockAngle)*this.shockForce;
  }
  if(c.attractors){
   const d=Math.hypot(this.x,this.y);
   if(d<=c.blackHoleRadius){this.dead=true;return 'attractor';}
   const force=c.blackHoleStrength/(Math.pow(d,1.5)+30);
   fx-=this.x/d*force;fy-=this.y/d*force;
  }
  fx+=centrifugalX;fy+=centrifugalY;
  this.vx+=fx/this.mass*dt;this.vy+=fy/this.mass*dt;
  const drag=Math.pow(c.friction,dt*60);
  this.vx*=drag;this.vy*=drag;
  this.x+=this.vx*dt;this.y+=this.vy*dt;
  this.trail.push({x:this.x,y:this.y});if(this.trail.length>22)this.trail.shift();
  const particleRadius=12*(c.mass?Math.sqrt(this.mass):1);
  if(Math.hypot(this.x,this.y)+particleRadius>=this.radius){
   this.dead=true;return 'boundary';
  }
  return event;
 }
}

global.PaulTrap={IonTrapPhysicsEngine,STAGES,STAGE_SECONDS:20};
})(window);
