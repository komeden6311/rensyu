import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const STICK_R = 65, KNOB_R = 26;
const CLEAR_THRESH = 0.65;
const MOVE_SPD = 0.003, SPRINT_MULT = 2.8, TURN_SPD = 0.003, INERTIA = 0.96;
const HEAT_DRAIN = 0.35, HEAT_REGEN = 0.28;
const STAMINA_DRAIN = 0.55, STAMINA_REGEN = 0.22;

export default function Rampage3D() {
  const mountRef     = useRef(null);
  const gsRef        = useRef(null);
  const keysRef      = useRef({});
  const touchRef     = useRef({ jx:0, jy:0, fire:false, sprint:false });
  const stickFinger  = useRef({ active:false, id:null, sx:0, sy:0 });
  const fireFinger   = useRef({ active:false, id:null });
  const sprintFinger = useRef({ active:false, id:null });
  const rafRef       = useRef(null);

  const [ui, setUi] = useState({
    screen:"playing", hp:100, heat:100, stamina:100,
    gf:0, pct:0, phase:1, destroyed:0, total:0,
  });
  const [fireActive,   setFireActive]   = useState(false);
  const [sprintActive, setSprintActive] = useState(false);
  const [stickVis,     setStickVis]     = useState(null);

  const firePos   = () => ({ x:window.innerWidth-80,  y:window.innerHeight-110 });
  const sprintPos = () => ({ x:window.innerWidth-80,  y:window.innerHeight-230 });

  const onTS = (e) => {
    e.preventDefault();
    const fp=firePos(), sp=sprintPos();
    for (const t of e.changedTouches) {
      const tx=t.clientX, ty=t.clientY;
      if (!fireFinger.current.active && Math.hypot(tx-fp.x,ty-fp.y)<70) {
        fireFinger.current={active:true,id:t.identifier};
        touchRef.current.fire=true; setFireActive(true); continue;
      }
      if (!sprintFinger.current.active && Math.hypot(tx-sp.x,ty-sp.y)<60) {
        sprintFinger.current={active:true,id:t.identifier};
        touchRef.current.sprint=true; setSprintActive(true); continue;
      }
      if (!stickFinger.current.active && tx<window.innerWidth*0.55) {
        stickFinger.current={active:true,id:t.identifier,sx:tx,sy:ty};
        setStickVis({cx:tx,cy:ty,kx:tx,ky:ty});
      }
    }
  };
  const onTM = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stickFinger.current.active && t.identifier===stickFinger.current.id) {
        const dx=t.clientX-stickFinger.current.sx, dy=t.clientY-stickFinger.current.sy;
        const dist=Math.hypot(dx,dy);
        const nx=dist>STICK_R?(dx/dist)*STICK_R:dx, ny=dist>STICK_R?(dy/dist)*STICK_R:dy;
        touchRef.current.jx=dist>8?dx/Math.max(dist,1):0;
        touchRef.current.jy=dist>8?dy/Math.max(dist,1):0;
        setStickVis({cx:stickFinger.current.sx,cy:stickFinger.current.sy,
          kx:stickFinger.current.sx+nx,ky:stickFinger.current.sy+ny});
      }
    }
  };
  const onTE = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stickFinger.current.active  && t.identifier===stickFinger.current.id) {
        stickFinger.current={active:false,id:null};
        touchRef.current.jx=0; touchRef.current.jy=0; setStickVis(null);
      }
      if (fireFinger.current.active   && t.identifier===fireFinger.current.id) {
        fireFinger.current={active:false,id:null};
        touchRef.current.fire=false; setFireActive(false);
      }
      if (sprintFinger.current.active && t.identifier===sprintFinger.current.id) {
        sprintFinger.current={active:false,id:null};
        touchRef.current.sprint=false; setSprintActive(false);
      }
    }
  };

  useEffect(() => {
    const container=mountRef.current;
    const W=container.clientWidth, H=container.clientHeight;
    const renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(W,H);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87CEEB);
    container.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x87CEEB,80,240);
    const camera=new THREE.PerspectiveCamera(65,W/H,0.1,500);
    camera.position.set(0,14,28); camera.lookAt(0,3,0);

    scene.add(new THREE.AmbientLight(0xFFE8CC,0.75));
    const sun=new THREE.DirectionalLight(0xFFF4D0,1.4);
    sun.position.set(40,80,40); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-100; sun.shadow.camera.right=100;
    sun.shadow.camera.top=100;   sun.shadow.camera.bottom=-100;
    sun.shadow.camera.near=1;    sun.shadow.camera.far=300;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0xCCDDFF,0.35);
    fill.position.set(-30,20,-30); scene.add(fill);

    const gGeo=new THREE.PlaneGeometry(300,300,50,50);
    const gPos=gGeo.attributes.position;
    for (let i=0;i<gPos.count;i++)
      gPos.setY(i,Math.sin(gPos.getX(i)*0.12)*Math.cos(gPos.getZ(i)*0.1)*0.3);
    gGeo.computeVertexNormals();
    const ground=new THREE.Mesh(gGeo,new THREE.MeshLambertMaterial({color:0x6BAA5A}));
    ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

    const roadMat=new THREE.MeshLambertMaterial({color:0x777777});
    for (let i=-7;i<=7;i++) {
      const r1=new THREE.Mesh(new THREE.PlaneGeometry(300,2.5),roadMat);
      r1.rotation.x=-Math.PI/2; r1.position.set(0,0.01,i*18); scene.add(r1);
      const r2=new THREE.Mesh(new THREE.PlaneGeometry(2.5,300),roadMat);
      r2.rotation.x=-Math.PI/2; r2.position.set(i*18,0.01,0); scene.add(r2);
    }

    const bColors=[0xD4C4B0,0xB8C8D8,0xCCC0B4,0xB4C4B8,0xD0BBBB,0xC4D0B8,0xBBBBCC];
    const buildings=[];
    const GRID=18;
    for (let ci=-7;ci<=7;ci++) {
      for (let ri=-7;ri<=7;ri++) {
        const bx=ci*GRID+(Math.random()-0.5)*5, bz=ri*GRID+(Math.random()-0.5)*5;
        const dc=Math.hypot(bx,bz);
        const downtown=dc<38, mid=dc<65&&!downtown;
        const cnt=downtown?1:mid?Math.floor(1+Math.random()*2):Math.floor(2+Math.random()*2);
        for (let k=0;k<cnt;k++) {
          const w=downtown?3.5+Math.random()*4.5:1.8+Math.random()*2.8;
          const h=downtown?10+Math.random()*22:mid?3+Math.random()*9:1.5+Math.random()*5;
          const d=downtown?3.5+Math.random()*4.5:1.8+Math.random()*2.8;
          const color=bColors[Math.floor(Math.random()*bColors.length)];
          const geo=new THREE.BoxGeometry(w,h,d);
          const bp=geo.attributes.position;
          for (let vi=0;vi<bp.count;vi++)
            if(bp.getY(vi)>0){bp.setX(vi,bp.getX(vi)+(Math.random()-0.5)*0.12);bp.setZ(vi,bp.getZ(vi)+(Math.random()-0.5)*0.12);}
          geo.computeVertexNormals();
          const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color}));
          mesh.position.set(bx+(Math.random()-0.5)*(GRID*0.55),h/2,bz+(Math.random()-0.5)*(GRID*0.55));
          mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
          buildings.push({mesh,hp:Math.floor(8+h*5),maxHp:Math.floor(8+h*5),destroyed:false,w,h,d,origColor:color});
        }
      }
    }

    const kaijuGroup=new THREE.Group();
    const flatG=new THREE.MeshLambertMaterial({color:0x2D5010,flatShading:true});
    const darkG=new THREE.MeshLambertMaterial({color:0x1C3A08,flatShading:true});
    const midG =new THREE.MeshLambertMaterial({color:0x3D6520,flatShading:true});
    const eyeM =new THREE.MeshBasicMaterial({color:0xFF2200});
    const bodyMesh=new THREE.Mesh(new THREE.DodecahedronGeometry(2.0,0),flatG);
    bodyMesh.scale.set(1.0,1.25,0.95); bodyMesh.position.y=0.4; bodyMesh.castShadow=true; kaijuGroup.add(bodyMesh);
    const belly=new THREE.Mesh(new THREE.SphereGeometry(1.1,5,4),midG);
    belly.scale.set(0.9,1.1,0.6); belly.position.set(0,0.3,0.95); kaijuGroup.add(belly);
    const headMesh=new THREE.Mesh(new THREE.DodecahedronGeometry(1.15,0),darkG);
    headMesh.position.set(0,3.0,0.5); kaijuGroup.add(headMesh);
    const snout=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.42,0.9),darkG);
    snout.position.set(0,2.65,1.25); kaijuGroup.add(snout);
    [-0.4,0.4].forEach(ex=>{
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.2,5,4),eyeM);
      eye.position.set(ex,3.08,1.08); kaijuGroup.add(eye);
      const glow=new THREE.Mesh(new THREE.SphereGeometry(0.28,5,4),new THREE.MeshBasicMaterial({color:0xFF4400,transparent:true,opacity:0.35}));
      glow.position.copy(eye.position); kaijuGroup.add(glow);
    });
    [0,1,2,3,4].forEach(i=>{
      const sm=new THREE.Mesh(new THREE.ConeGeometry(0.18-i*0.015,0.65+i*0.12,4),darkG);
      sm.position.set(0,1.3+i*0.25,-0.5+i*-0.28); kaijuGroup.add(sm);
    });
    [-1.05,1.05].forEach(side=>{
      const arm=new THREE.Mesh(new THREE.SphereGeometry(0.5,5,4),flatG);
      arm.scale.set(0.7,1.5,0.7); arm.position.set(side*1.95,0.4,0.4); kaijuGroup.add(arm);
    });
    [-0.85,0.85].forEach(side=>{
      const leg=new THREE.Mesh(new THREE.SphereGeometry(0.55,5,4),flatG);
      leg.scale.set(0.85,1.6,0.85); leg.position.set(side,-1.3,0.1); kaijuGroup.add(leg);
    });
    [0,1,2,3,4].forEach(i=>{
      const tr=Math.max(0.1,0.55-i*0.09);
      const ts=new THREE.Mesh(new THREE.SphereGeometry(tr,5,4),i%2===0?flatG:darkG);
      ts.position.set(Math.sin(i*0.4)*0.4,0.3-i*0.12,-1.2-i*0.95); kaijuGroup.add(ts);
    });
    kaijuGroup.position.set(0,2.5,0); scene.add(kaijuGroup);

    const beamGroup=new THREE.Group(); scene.add(beamGroup);
    const outerBeam=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.55,1,6,1,true),
      new THREE.MeshBasicMaterial({color:0xFF6600,transparent:true,opacity:0.8,side:THREE.DoubleSide}));
    const innerBeam=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.2,1,5,1,true),
      new THREE.MeshBasicMaterial({color:0xFFFFAA,transparent:true,opacity:0.65,side:THREE.DoubleSide}));
    beamGroup.add(outerBeam); beamGroup.add(innerBeam); beamGroup.visible=false;

    const enemies=[];
    function spawnEnemy(phase){
      const angle=Math.random()*Math.PI*2, dist=75+Math.random()*30;
      const ex=Math.cos(angle)*dist, ez=Math.sin(angle)*dist;
      let color,speed,dmg,scale,isHeli;
      if(phase===1){color=0x4488FF;speed=0.018;dmg=0.12;scale=0.6;isHeli=false;}
      else if(phase===2){
        if(Math.random()<0.45){color=0x886644;speed=0.012;dmg=0.55;scale=0.9;isHeli=false;}
        else{color=0x445566;speed=0.032;dmg=0.35;scale=0.5;isHeli=true;}
      }else{
        const r=Math.random();
        if(r<0.28){color=0xAA44CC;speed=0.009;dmg=1.4;scale=1.1;isHeli=false;}
        else if(r<0.60){color=0x886644;speed=0.016;dmg=0.8;scale=0.9;isHeli=false;}
        else{color=0x445566;speed=0.038;dmg=0.65;scale=0.5;isHeli=true;}
      }
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(scale*1.8,scale*0.75,scale*2.8),
        new THREE.MeshLambertMaterial({color,flatShading:true}));
      mesh.position.set(ex,isHeli?scale*2+3:scale*0.38,ez);
      mesh.castShadow=true; scene.add(mesh);
      enemies.push({mesh,speed,dmg,scale,isHeli,t:Math.random()*Math.PI*2});
    }

    const particles=[];
    function spawnParticles(pos,type){
      const count=type==="explosion"?20:10;
      for(let i=0;i<count;i++){
        const s=0.25+Math.random()*0.45;
        const color=type==="explosion"?[0xFF4400,0xFFCC00,0xFF8800][Math.floor(Math.random()*3)]:[0x999999,0x888888,0xBBBBBB][Math.floor(Math.random()*3)];
        const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));
        m.position.copy(pos);
        const spd=type==="explosion"?0.09:0.05;
        particles.push({mesh:m,vx:(Math.random()-0.5)*spd*2.5,vy:Math.random()*spd*2+0.08,vz:(Math.random()-0.5)*spd*2.5,life:45+Math.random()*35,maxLife:80});
        scene.add(m);
      }
    }

    const fires=[];
    function addFire(pos){
      for(let i=0;i<4;i++){
        const m=new THREE.Mesh(new THREE.SphereGeometry(0.35,4,3),new THREE.MeshBasicMaterial({color:0xFF6600,transparent:true,opacity:0.9}));
        m.position.set(pos.x+(Math.random()-0.5)*2.5,pos.y+Math.random()*2,pos.z+(Math.random()-0.5)*2.5);
        scene.add(m);
        fires.push({mesh:m,baseX:m.position.x,baseY:m.position.y,baseZ:m.position.z,phase:Math.random()*Math.PI*2});
      }
    }

    const S={
      screen:"playing",kx:0,kz:0,kvx:0,kvz:0,kAngle:0,
      hp:100,heat:100,stamina:100,stagger:0,
      camX:0,camY:14,camZ:28,
      phase:1,spawnTimer:0,spawnInt:165,
      gf:0,destroyed:0,total:buildings.length,t:0,
    };

    function resetGame(){
      S.kx=0;S.kz=0;S.kvx=0;S.kvz=0;S.kAngle=0;
      S.hp=100;S.heat=100;S.stamina=100;S.stagger=0;
      S.phase=1;S.spawnTimer=0;S.gf=0;S.destroyed=0;S.t=0;
      S.camX=0;S.camY=14;S.camZ=28;S.screen="playing";
      buildings.forEach(b=>{b.hp=b.maxHp;b.destroyed=false;b.mesh.visible=true;b.mesh.material.color.setHex(b.origColor);});
      enemies.forEach(e=>scene.remove(e.mesh));   enemies.length=0;
      particles.forEach(p=>scene.remove(p.mesh)); particles.length=0;
      fires.forEach(f=>scene.remove(f.mesh));     fires.length=0;
      beamGroup.visible=false;
    }
    gsRef.current={S,resetGame};

    let prev=performance.now(), tick=0;
    function loop(){
      rafRef.current=requestAnimationFrame(loop);
      const now=performance.now(), dt=Math.min((now-prev)/16.67,2.5); prev=now;
      if(S.screen!=="playing"){renderer.render(scene,camera);return;}
      S.t+=dt;

      let ix=0,iz=0;
      if(keysRef.current["KeyA"]||keysRef.current["ArrowLeft"])  ix-=1;
      if(keysRef.current["KeyD"]||keysRef.current["ArrowRight"]) ix+=1;
      if(keysRef.current["KeyW"]||keysRef.current["ArrowUp"])    iz-=1;
      if(keysRef.current["KeyS"]||keysRef.current["ArrowDown"])  iz+=1;
      const tj=touchRef.current;
      if(tj.jx||tj.jy){const ca=S.kAngle;ix=tj.jx*Math.cos(ca)+tj.jy*Math.sin(ca);iz=-tj.jx*Math.sin(ca)+tj.jy*Math.cos(ca);}
      const moving=!!(ix||iz);
      const sprinting=(keysRef.current["ShiftLeft"]||keysRef.current["ShiftRight"]||tj.sprint)&&moving&&S.stamina>0;
      if(sprinting)S.stamina=Math.max(0,S.stamina-STAMINA_DRAIN*dt);
      else         S.stamina=Math.min(100,S.stamina+STAMINA_REGEN*dt);

      const spd=MOVE_SPD*(S.stagger>0?0.25:sprinting?SPRINT_MULT:1);
      const len=moving?Math.hypot(ix,iz):1;
      S.kvx=S.kvx*INERTIA+(moving?(ix/len)*spd:0);
      S.kvz=S.kvz*INERTIA+(moving?(iz/len)*spd:0);
      if(moving){let da=Math.atan2(ix,iz)-S.kAngle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;S.kAngle+=da*TURN_SPD;}
      S.kx=Math.max(-130,Math.min(130,S.kx+S.kvx*dt));
      S.kz=Math.max(-130,Math.min(130,S.kz+S.kvz*dt));
      if(S.stagger>0)S.stagger=Math.max(0,S.stagger-dt/55);

      const fireOn=keysRef.current["Space"]||keysRef.current["KeyF"]||tj.fire;
      const heatOn=fireOn&&S.heat>=8;
      if(heatOn)S.heat=Math.max(0,S.heat-HEAT_DRAIN*dt);
      else      S.heat=Math.min(100,S.heat+HEAT_REGEN*dt);

      const wc=S.t*0.045, bounce=moving?Math.abs(Math.sin(wc))*0.35:0;
      kaijuGroup.position.set(S.kx,2.5+bounce,S.kz);
      kaijuGroup.rotation.y=S.kAngle;
      bodyMesh.rotation.z=moving?Math.sin(wc)*0.08:0;

      const cb=S.kAngle+Math.PI;
      S.camX+=(S.kx+Math.sin(cb)*28-S.camX)*0.028;
      S.camY+=(13-S.camY)*0.028;
      S.camZ+=(S.kz+Math.cos(cb)*28-S.camZ)*0.028;
      camera.position.set(S.camX,S.camY,S.camZ);
      camera.lookAt(S.kx,3.5,S.kz);
      sun.position.set(S.kx+40,80,S.kz+40);
      sun.target.position.set(S.kx,0,S.kz); sun.target.updateMatrixWorld();

      if(heatOn){
        const bLen=55;
        beamGroup.position.set(S.kx+Math.sin(S.kAngle)*bLen/2,3.2,S.kz+Math.cos(S.kAngle)*bLen/2);
        beamGroup.scale.set(1,bLen,1); beamGroup.rotation.set(Math.PI/2,0,-S.kAngle);
        beamGroup.visible=true; outerBeam.material.opacity=0.7+Math.sin(S.t*0.45)*0.18;
      }else beamGroup.visible=false;

      for(const b of buildings){
        if(b.destroyed)continue;
        const bp=b.mesh.position, dist=Math.hypot(S.kx-bp.x,S.kz-bp.z);
        if(dist<Math.max(b.w,b.d)*0.5+2.8)b.hp-=1.2*dt;
        if(heatOn){
          const dx=bp.x-S.kx,dz=bp.z-S.kz,dot=dx*Math.sin(S.kAngle)+dz*Math.cos(S.kAngle);
          if(dot>0&&dot<57&&Math.abs(dx*Math.cos(S.kAngle)-dz*Math.sin(S.kAngle))<Math.max(b.w,b.d)*0.55+1.8)b.hp-=2.5*dt;
        }
        if(b.hp<=0){
          b.destroyed=true; spawnParticles(bp.clone(),"explosion"); addFire(bp.clone());
          b.mesh.visible=false; S.destroyed++; S.gf+=b.maxHp*0.7;
          const pct=S.total>0?S.destroyed/S.total:0;
          if(pct>=0.3&&S.phase<2)S.phase=2;
          if(pct>=0.55&&S.phase<3)S.phase=3;
          if(pct>=CLEAR_THRESH){S.screen="clear";setUi(u=>({...u,screen:"clear"}));}
        }else{
          const pct=b.hp/b.maxHp;
          b.mesh.material.color.setRGB(((b.origColor>>16)&0xFF)/255*pct+(1-pct)*0.55,((b.origColor>>8)&0xFF)/255*pct,(b.origColor&0xFF)/255*pct*0.5);
        }
      }

      S.spawnTimer-=dt;
      if(S.spawnTimer<=0&&enemies.length<28){spawnEnemy(S.phase);S.spawnTimer=S.spawnInt/(1+(S.phase-1)*0.4);}
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i]; e.t+=0.04*dt;
        const ep=e.mesh.position, d=Math.hypot(S.kx-ep.x,S.kz-ep.z), ang=Math.atan2(S.kx-ep.x,S.kz-ep.z);
        if(d>e.scale+3.8){ep.x+=Math.sin(ang)*e.speed*dt;ep.z+=Math.cos(ang)*e.speed*dt;e.mesh.rotation.y=ang;}
        else{S.hp-=e.dmg*dt;S.hp=Math.max(0,S.hp);}
        if(e.isHeli)ep.y=e.scale*2+3.5+Math.sin(e.t*3)*1.2;
        if(heatOn){
          const dx=ep.x-S.kx,dz=ep.z-S.kz,dot=dx*Math.sin(S.kAngle)+dz*Math.cos(S.kAngle);
          if(dot>0&&dot<58&&Math.abs(dx*Math.cos(S.kAngle)-dz*Math.sin(S.kAngle))<e.scale*1.6+1.5){
            spawnParticles(ep.clone(),"explosion");S.gf+=18;scene.remove(e.mesh);enemies.splice(i,1);continue;
          }
        }
        if(d<3.2){spawnParticles(ep.clone(),"rubble");S.gf+=6;scene.remove(e.mesh);enemies.splice(i,1);continue;}
        if(Math.abs(ep.x)>170||Math.abs(ep.z)>170){scene.remove(e.mesh);enemies.splice(i,1);}
      }

      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;
        p.vy-=0.009*dt;p.vx*=0.97;p.vz*=0.97;
        p.mesh.rotation.x+=0.07*dt;p.mesh.rotation.z+=0.06*dt;
        p.life-=dt;p.mesh.material.opacity=Math.max(0,p.life/p.maxLife);
        if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}
      }
      for(const f of fires){
        f.phase+=0.018*dt;
        f.mesh.position.x=f.baseX+Math.sin(f.phase*0.9)*0.4;
        f.mesh.position.y=f.baseY+Math.abs(Math.sin(f.phase))*1.2;
        f.mesh.position.z=f.baseZ+Math.cos(f.phase*0.7)*0.4;
        f.mesh.material.color.setRGB(1,0.25+((Math.sin(f.phase*2.5)+1)/2)*0.5,0);
        f.mesh.material.opacity=0.6+Math.sin(f.phase*1.5)*0.3;
      }

      if(S.hp<=0){S.hp=0;S.screen="gameover";setUi(u=>({...u,screen:"gameover"}));}
      tick++;
      if(tick%4===0){
        const pct=S.total>0?S.destroyed/S.total:0;
        setUi({screen:S.screen,hp:Math.round(S.hp),heat:Math.round(S.heat),stamina:Math.round(S.stamina),gf:Math.floor(S.gf),pct,phase:S.phase,destroyed:S.destroyed,total:S.total});
      }
      renderer.render(scene,camera);
    }

    const kd=e=>{keysRef.current[e.code]=true;if(e.code==="Space")e.preventDefault();};
    const ku=e=>{keysRef.current[e.code]=false;};
    window.addEventListener("keydown",kd); window.addEventListener("keyup",ku);
    const el=renderer.domElement;
    el.addEventListener("touchstart",onTS,{passive:false}); el.addEventListener("touchmove",onTM,{passive:false});
    el.addEventListener("touchend",onTE,{passive:false});   el.addEventListener("touchcancel",onTE,{passive:false});
    const onResize=()=>{
      const W2=container.clientWidth, H2=container.clientHeight;
      renderer.setSize(W2,H2); camera.aspect=W2/H2; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize",onResize);
    rafRef.current=requestAnimationFrame(loop);
    return()=>{
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown",kd); window.removeEventListener("keyup",ku); window.removeEventListener("resize",onResize);
      el.removeEventListener("touchstart",onTS); el.removeEventListener("touchmove",onTM);
      el.removeEventListener("touchend",onTE);   el.removeEventListener("touchcancel",onTE);
      renderer.dispose();
      if(container.contains(renderer.domElement))container.removeChild(renderer.domElement);
    };
  },[]);

  const retry=()=>{
    const g=gsRef.current; if(g)g.resetGame();
    touchRef.current={jx:0,jy:0,fire:false,sprint:false};
    stickFinger.current={active:false,id:null}; fireFinger.current={active:false,id:null}; sprintFinger.current={active:false,id:null};
    setStickVis(null); setFireActive(false); setSprintActive(false);
    setUi(u=>({...u,screen:"playing",hp:100,heat:100,stamina:100,gf:0,pct:0,phase:1,destroyed:0}));
  };

  const ff='"Courier New",monospace';
  const {screen,hp,heat,stamina,gf,pct,phase,destroyed,total}=ui;
  const phaseC=["","#44AAFF","#FFAA44","#FF4444"][phase]||"#FFF";
  const phaseL=["","P1 無力","P2 抵抗","P3 脅威"][phase]||"";
  const bars=[
    {label:"KAIJU HP",val:hp,color:hp>50?"#44EE88":hp>25?"#FFAA33":"#FF3322",sub:`${hp}/100`},
    {label:"熱線ゲージ",val:heat,color:heat>30?"#FFCC00":"#FF5500",sub:`${heat}%`},
    {label:"スタミナ",val:stamina,color:stamina>40?"#44CCFF":stamina>15?"#FFAA33":"#FF3322",sub:`${stamina}%`},
    {label:`破壊 ${(pct*100).toFixed(0)}%/65%`,val:pct/CLEAR_THRESH*100,color:"#CC3311",sub:`${destroyed}/${total}棟`},
  ];

  return (
    <div style={{position:"relative",width:"100%",height:"100vh",background:"#87CEEB",overflow:"hidden",touchAction:"none",userSelect:"none"}}>
      <div ref={mountRef} style={{position:"absolute",inset:0}}/>

      {screen==="playing"&&(
        <div style={{position:"absolute",inset:0,pointerEvents:"none",fontFamily:ff}}>
          <div style={{position:"absolute",top:0,left:0,right:0,background:"linear-gradient(to bottom,rgba(0,0,0,0.82),transparent)",padding:"8px 14px 22px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
            {bars.map(({label,val,color,sub})=>(
              <div key={label} style={{minWidth:90}}>
                <div style={{color:"#FF9966",fontSize:9,marginBottom:3,letterSpacing:1}}>{label}</div>
                <div style={{background:"rgba(255,255,255,0.12)",height:6,borderRadius:2}}>
                  <div style={{background:color,width:`${Math.min(Math.max(val,0),100)}%`,height:"100%",borderRadius:2,boxShadow:`0 0 6px ${color}`}}/>
                </div>
                <div style={{color:"#555",fontSize:8,marginTop:1}}>{sub}</div>
              </div>
            ))}
            <div>
              <div style={{color:"#88FF66",fontSize:9,letterSpacing:1}}>G因子</div>
              <div style={{color:"#88FF66",fontSize:14,fontWeight:"bold",textShadow:"0 0 9px #88FF66"}}>{gf.toLocaleString()}</div>
            </div>
            <div style={{marginLeft:"auto"}}>
              <div style={{color:phaseC,fontSize:10,fontWeight:"bold",border:`1px solid ${phaseC}`,padding:"3px 8px",boxShadow:`0 0 10px ${phaseC}66`}}>{phaseL}</div>
            </div>
          </div>
          <div style={{position:"absolute",right:36,bottom:174,width:72,height:72,borderRadius:"50%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:sprintActive?"radial-gradient(circle at 38% 38%,#88EEFF,#2299CC,#115588)":"radial-gradient(circle at 38% 38%,rgba(80,180,255,0.38),rgba(20,80,160,0.22))",border:sprintActive?"3px solid #44DDFF":"2px solid rgba(80,180,255,0.38)",boxShadow:sprintActive?"0 0 28px rgba(50,200,255,0.9)":"0 0 9px rgba(50,150,255,0.26)"}}>
            <div style={{fontSize:20}}>💨</div>
            <div style={{color:sprintActive?"#FFF":"rgba(150,220,255,0.7)",fontSize:8}}>ダッシュ</div>
          </div>
          <div style={{position:"absolute",right:30,bottom:50,width:96,height:96,borderRadius:"50%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:fireActive?"radial-gradient(circle at 38% 38%,#FFEE44,#FF6600,#CC2200)":"radial-gradient(circle at 38% 38%,rgba(255,150,50,0.4),rgba(200,60,0,0.24))",border:fireActive?"3px solid #FFD700":"2px solid rgba(255,140,0,0.4)",boxShadow:fireActive?"0 0 32px rgba(255,120,0,0.9)":"0 0 10px rgba(255,80,0,0.26)"}}>
            <div style={{fontSize:26}}>🔥</div>
            <div style={{color:fireActive?"#FFF":"rgba(255,200,100,0.7)",fontSize:8}}>熱線</div>
          </div>
          {!stickVis&&<div style={{position:"absolute",left:76,bottom:100,width:STICK_R*2,height:STICK_R*2,borderRadius:"50%",transform:"translate(-50%,50%)",border:"2px dashed rgba(255,255,255,0.13)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"rgba(255,255,255,0.2)",fontSize:10}}>移動</span></div>}
          {stickVis&&(
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
              <circle cx={stickVis.cx} cy={stickVis.cy} r={STICK_R} fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.22)" strokeWidth="2"/>
              <circle cx={stickVis.kx} cy={stickVis.ky} r={KNOB_R} fill="rgba(100,220,140,0.45)" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5"/>
            </svg>
          )}
          <div style={{position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",color:"rgba(255,255,255,0.2)",fontSize:9,whiteSpace:"nowrap"}}>
            WASD / Shift / Space(熱線)
          </div>
        </div>
      )}

      {screen==="clear"&&(
        <div style={{position:"absolute",inset:0,background:"rgba(8,3,0,0.93)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:ff,color:"#FFF",textAlign:"center",padding:"0 24px"}}>
          <div style={{fontSize:8,letterSpacing:3,color:"#FF4444",marginBottom:10}}>⚠ EMERGENCY BROADCAST ⚠</div>
          <div style={{fontSize:"min(14vw,56px)",fontWeight:900,color:"#FF6644",textShadow:"0 0 50px rgba(255,100,50,0.9)",fontFamily:'Impact,sans-serif',letterSpacing:4}}>STAGE CLEAR</div>
          <div style={{marginTop:20,padding:"14px 24px",border:"1px solid rgba(255,100,50,0.25)",lineHeight:2.2,fontSize:12,color:"#BBB"}}>
            <div>被害棟数: <span style={{color:"#FF6644",fontWeight:"bold"}}>{destroyed}/{total}棟</span></div>
            <div>破壊率: <span style={{color:"#FF6644",fontWeight:"bold"}}>{(pct*100).toFixed(1)}%</span></div>
            <div>獲得G因子: <span style={{color:"#88FF66",fontWeight:"bold"}}>{gf.toLocaleString()}</span></div>
          </div>
          <button onClick={retry} style={{marginTop:20,background:"transparent",border:"1px solid #555",color:"#777",fontSize:13,padding:"9px 28px",cursor:"pointer",fontFamily:ff,letterSpacing:3}}>再挑戦</button>
        </div>
      )}

      {screen==="gameover"&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,4,14,0.95)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:ff,color:"#FFF",textAlign:"center",padding:"0 24px"}}>
          <div style={{fontSize:9,letterSpacing:4,color:"#4488FF",marginBottom:10}}>▶ 人類防衛軍 ── 戦略目標達成</div>
          <div style={{fontSize:"min(17vw,68px)",fontWeight:900,color:"#4488FF",textShadow:"0 0 50px rgba(68,136,255,0.85)",fontFamily:'Impact,sans-serif'}}>DEFEATED</div>
          <div style={{marginTop:20,color:"#555",fontSize:11,lineHeight:2.0}}>
            <div>破壊率: {(pct*100).toFixed(1)}%（目標65%）</div>
            <div>獲得G因子: {gf.toLocaleString()}</div>
          </div>
          <button onClick={retry} style={{marginTop:20,background:"transparent",border:"1px solid #4488FF",color:"#4488FF",fontSize:14,padding:"11px 36px",cursor:"pointer",fontFamily:ff,letterSpacing:4,boxShadow:"0 0 22px rgba(68,136,255,0.3)"}}>再起動</button>
        </div>
      )}
    </div>
  );
}
