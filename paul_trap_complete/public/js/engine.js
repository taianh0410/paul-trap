/* Reworked from the team's IonTrapPhysicsEngine: consistent 20s stages, moving attractors, fixed-step physics. */
(function(global){
'use strict';
const STAGES=[
 {years:'1956–1966',name:'KHỞI NGUYÊN',subtitle:'Nền móng · Dao động điều hòa',color:'#42c8ff',noise:38,drag:2.8,impulse:0,slip:false},
 {years:'1966–1976',name:'KHÁNG CHIẾN',subtitle:'Xung lực · Phản xạ',color:'#ff537b',noise:42,drag:2.6,impulse:1.0},
 {years:'1976–1986',name:'TÁI THIẾT',subtitle:'Không gian ít ma sát',color:'#4de5df',noise:40,drag:0.18,impulse:0},
 {years:'1986–1996',name:'ĐỔI MỚI',subtitle:'Khối lượng biến thiên',color:'#ffd166',noise:42,drag:2.3,mass:true},
 {years:'1996–2006',name:'HỘI NHẬP',subtitle:'Các điểm hấp dẫn di động',color:'#b68cff',noise:38,drag:2.5,attractors:true},
 {years:'2006–2016',name:'VƯƠN TẦM',subtitle:'Xoay hệ tọa độ',color:'#ff81c5',noise:43,drag:2.3,rotation:true},
 {years:'2016–2026',name:'CHUYỂN ĐỔI SỐ',subtitle:'Hỗn loạn lượng tử',color:'#a8ff78',noise:52,drag:0.35,impulse:1.8,mass:true,rotation:true,attractors:true}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class IonTrapPhysicsEngine{
 constructor(){this.radius=260;this.reset();}
 reset(){this.stage=1;this.t=0;this.x=0;this.y=0;this.vx=0;this.vy=0;this.beta=0;this.gamma=0;this.inputX=0;this.inputY=0;this.trail=[];this.shock=0;this.shockAngle=0;this.dead=false;this.lastEvent=null;}
 startStage(n){this.stage=clamp(n,1,7);this.t=0;this.x=0;this.y=0;this.vx=0;this.vy=0;this.trail=[];this.shock=0;this.dead=false;this.lastEvent=null;}
 handleSocketSyncData(beta,gamma){if(!Number.isFinite(beta)||!Number.isFinite(gamma))return;this.beta=clamp(beta,-45,45);this.gamma=clamp(gamma,-45,45);}
 get config(){return STAGES[this.stage-1];}
 get attractors(){if(!this.config.attractors)return [];return [0,1,2].map((n)=>{const a=this.t*(0.48+n*.11)+n*Math.PI*2/3;return {x:Math.cos(a)*this.radius*.79,y:Math.sin(a)*this.radius*.79,r:12};});}
 update(dt){if(this.dead)return null;dt=clamp(dt,0,1/30);this.t+=dt;const c=this.config;const smoothing=1-Math.exp(-dt*9);this.inputX+=(this.gamma/35-this.inputX)*smoothing;this.inputY+=(this.beta/35-this.inputY)*smoothing;
 let theta=c.rotation?(this.t*.11+Math.sin(this.t*.32)*.22):0;
 let fx=(this.inputX*Math.cos(theta)-this.inputY*Math.sin(theta))*230;
 let fy=(this.inputX*Math.sin(theta)+this.inputY*Math.cos(theta))*230;
 fx+=Math.sin(this.t*1.1)*c.noise+Math.sin(this.t*2.3)*c.noise*.3;
 fy+=Math.cos(this.t*.83)*c.noise+Math.sin(this.t*1.6)*c.noise*.35;
 let event=null;
 if(c.impulse && this.shock<=0 && Math.random()<dt*(c.impulse*.18)){this.shock=.20;this.shockAngle=Math.random()*Math.PI*2;event='shock';}
 if(this.shock>0){this.shock-=dt;fx+=Math.cos(this.shockAngle)*c.impulse*430;fy+=Math.sin(this.shockAngle)*c.impulse*430;}
 if(c.attractors){for(const a of this.attractors){const dx=a.x-this.x,dy=a.y-this.y,d2=dx*dx+dy*dy;const d=Math.sqrt(d2)||1;const force=Math.min(370,240000/(d2+1800));fx+=dx/d*force;fy+=dy/d*force;if(d<a.r+12){this.dead=true;return 'attractor';}}}
 const mass=c.mass?clamp(.95+.65*Math.sin(this.t*1.45),.30,1.65):1;
 this.vx+=(fx/mass)*dt;this.vy+=(fy/mass)*dt;
 const drag=Math.exp(-c.drag*dt);this.vx*=drag;this.vy*=drag;
 this.x+=this.vx*dt;this.y+=this.vy*dt;
 this.trail.push({x:this.x,y:this.y});if(this.trail.length>32)this.trail.shift();
 if(Math.hypot(this.x,this.y)>=this.radius-12){this.dead=true;return 'boundary';}
 return event;
 }
}
global.PaulTrap={IonTrapPhysicsEngine,STAGES,STAGE_SECONDS:20};
})(window);
