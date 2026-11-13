/* WebGL2 렌더러. drawView를 여러 번 호출하면 분할 뷰를 구성할 수 있습니다.
   기본 기능은 트랙볼/이동/거리 조절/전체 보기뿐이며 자동 안내는 구현하지 않습니다. */
(() => {
  'use strict';
  const canvas=document.querySelector('#cv'),gl=canvas.getContext('webgl2',{antialias:true}),read=document.querySelector('#readings');
  if(!gl){read.textContent='WebGL2를 사용할 수 없습니다. 지원하는 브라우저에서 열어 주세요.';return;}
  const M=D.M4,model=window.InspectionModel,controls=window.InspectionControls(canvas);
  const program=D.program(gl,`#version 300 es
    layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNormal;layout(location=2) in vec2 aUV;
    uniform mat4 uModel,uVP;uniform mat3 uNormal;out vec3 vN;out vec2 vUV;
    void main(){vN=uNormal*aNormal;vUV=aUV;gl_Position=uVP*uModel*vec4(aPos,1.0);}
  `,`#version 300 es
    precision highp float;in vec3 vN;in vec2 vUV;uniform vec3 uColor;uniform bool uText;uniform sampler2D uMap;out vec4 outColor;
    void main(){if(uText){outColor=texture(uMap,vUV);return;}float light=.48+.52*max(dot(normalize(vN),normalize(vec3(.4,1,.6))),0.0);outColor=vec4(uColor*light,1.0);}
  `);
  const U=D.uniforms(gl,program,['uModel','uVP','uNormal','uColor','uText','uMap']);
  const cube=D.upload(gl,D.cube(1));
  const plane=D.upload(gl,{pos:new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),nrm:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uv:new Float32Array([0,0,1,0,1,1,0,1]),idx:new Uint16Array([0,1,2,0,2,3])});
  function matrix(position,size,yaw=0){const m=M.create();M.translate(m,m,position);M.rotateY(m,m,yaw);M.scale(m,m,size);return m;}
  const parts=model.boxes.map(p=>({...p,matrix:matrix(p.position,p.size)}));
  function texture(sign){
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle='#fff9e9';ctx.fillRect(0,0,512,256);ctx.fillStyle='#122337';ctx.fillRect(0,0,512,62);
    ctx.fillStyle='#ffffff';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.fillText(sign.id,256,46);
    ctx.fillStyle='#122337';ctx.font='bold 60px sans-serif';ctx.fillText(sign.text[0],256,140);ctx.fillText(sign.text[1],256,220);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    return tex;
  }
  const signs=model.signs.map(p=>({...p,matrix:matrix(p.position,[...p.size,1],p.yaw),texture:texture(p)}));
  const view=M.create(),projection=M.create(),vp=M.create();
  const hidden=new Set();
  function drawMesh(mesh,m,color,text=false){gl.uniformMatrix4fv(U.uModel,false,m);gl.uniformMatrix3fv(U.uNormal,false,M.normalFrom(m));gl.uniform3fv(U.uColor,color);gl.uniform1i(U.uText,text?1:0);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);}
  // viewport: 그리기 버퍼의 픽셀 좌표 [x,y,width,height]. 원점은 왼쪽 아래입니다.
  let selected=null;
  function drawView(camera,viewport=[0,0,canvas.width,canvas.height]){
    const [x,y,w,h]=viewport;if(w<=0||h<=0)return;
    gl.viewport(x,y,w,h);gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,w,h);D.clearColor(gl);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.SCISSOR_TEST);
    M.lookAt(view,camera.eye,camera.target,camera.up||[0,1,0]);
    if(camera.orthographic){const half=camera.halfHeight||8;M.ortho(projection,-half*w/h,half*w/h,-half,half,camera.near||.02,camera.far||180);}
    else M.perspective(projection,(camera.fov||controls.state.fov)*Math.PI/180,w/h,camera.near||.02,camera.far||180);
    M.multiply(vp,projection,view);gl.useProgram(program);gl.uniformMatrix4fv(U.uVP,false,vp);gl.uniform1i(U.uMap,0);gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.CULL_FACE);
    for(const p of parts)if(!hidden.has(p.id)&&!hidden.has(p.group))drawMesh(cube,p.matrix,p===selected?[1,.62,.08]:p.color);
    // 명판의 뒷면은 어두운 무지 면으로 표시하고 앞쪽에서만 글자를 읽습니다.
    for(const s of signs)if(!hidden.has(s.id)&&!hidden.has(s.group)){
      drawMesh(plane,s.matrix,[.25,.28,.32]);gl.enable(gl.CULL_FACE);gl.depthFunc(gl.LEQUAL);gl.bindTexture(gl.TEXTURE_2D,s.texture);drawMesh(plane,s.matrix,[1,1,1],true);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);
    }
  }
  gl.enable(gl.DEPTH_TEST);
  let started=null,last='';
  const api={canvas,gl,model,controls,hidden,drawView,render:null};window.InspectionViewer=api;
  document.querySelector('#measure').addEventListener('click',()=>{started=performance.now();controls.state.actions=0;});
  const selection=document.querySelector('#selection');
  const viewHistory=[];
  function rememberView(){
    const state=controls.state;
    viewHistory.push({
      target:[...state.target],
      distance:state.distance,
      rotation:[...state.rotation],
      fov:state.fov,
      orthographic:state.orthographic,
      halfHeight:state.halfHeight,
      fixedView:state.fixedView?{direction:[...state.fixedView.direction],up:[...state.fixedView.up]}:null,
      selectedId:selected?.id||null
    });
    if(viewHistory.length>50)viewHistory.shift();
  }
  function undoSelectionZoom(){
    const previous=viewHistory.pop();
    if(!previous)return;
    const state=controls.state;
    state.target=[...previous.target];
    state.distance=previous.distance;
    state.rotation=[...previous.rotation];
    state.fov=previous.fov;
    state.orthographic=previous.orthographic;
    state.halfHeight=previous.halfHeight;
    state.fixedView=previous.fixedView?{direction:[...previous.fixedView.direction],up:[...previous.fixedView.up]}:null;
    selected=parts.find(part=>part.id===previous.selectedId)||null;
    selection.textContent=selected
      ?`선택: ${selected.id} · 좌표 (${selected.position.map(v=>v.toFixed(2)).join(', ')})`
      :'구조물을 클릭하면 선택한 요소를 확대합니다.';
    state.actions++;
  }
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&viewHistory.length){
      e.preventDefault();
      undoSelectionZoom();
    }
  });
  function selectAt(clientX,clientY){
    const rect=canvas.getBoundingClientRect(),camera=controls.camera();
    const x=(2*(clientX-rect.left)/rect.width)-1,y=1-(2*(clientY-rect.top)/rect.height);
    const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(c=>c/n);};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const forward=normalize(camera.target.map((v,i)=>v-camera.eye[i]));
    const right=normalize(cross(forward,camera.up)),up=normalize(cross(right,forward));
    const aspect=rect.width/rect.height;
    let origin=[...camera.eye],direction;
    if(camera.orthographic){
      const half=camera.halfHeight;
      origin=origin.map((v,i)=>v+right[i]*x*half*aspect+up[i]*y*half);
      direction=forward;
    }else{
      const scale=Math.tan(controls.state.fov*Math.PI/360);
      direction=normalize(forward.map((v,i)=>v+right[i]*x*scale*aspect+up[i]*y*scale));
    }
    let nearest=Infinity,hit=null;
    for(const part of parts){
      if(hidden.has(part.id)||hidden.has(part.group))continue;
      let near=0,far=Infinity;
      for(let axis=0;axis<3;axis++){
        const min=part.position[axis]-part.size[axis]/2,max=part.position[axis]+part.size[axis]/2;
        if(Math.abs(direction[axis])<1e-8){if(origin[axis]<min||origin[axis]>max){near=Infinity;break;}continue;}
        let a=(min-origin[axis])/direction[axis],b=(max-origin[axis])/direction[axis];
        if(a>b)[a,b]=[b,a];
        near=Math.max(near,a);far=Math.min(far,b);
        if(near>far)break;
      }
      if(near<=far&&far>=0&&near<nearest){nearest=near;hit=part;}
    }
    if(hit)rememberView();
    selected=hit;
    if(hit){
      controls.state.target=[...hit.position];
      const extent=Math.max(...hit.size);
      if(controls.state.orthographic)controls.state.halfHeight=Math.max(.35,extent*1.8);
      else controls.state.distance=Math.max(.8,extent*3.2);
      selection.textContent=`선택: ${hit.id} · 좌표 (${hit.position.map(v=>v.toFixed(2)).join(', ')})`;
    }else selection.textContent='구조물을 클릭하면 선택한 요소를 확대합니다.';
    controls.state.actions++;
  }
  let pointerStart=null;
  canvas.addEventListener('pointerdown',e=>{pointerStart={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button};});
  canvas.addEventListener('pointerup',e=>{
    if(!pointerStart||pointerStart.id!==e.pointerId)return;
    const moved=Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y);
    if(pointerStart.button===0&&moved<3)selectAt(e.clientX,e.clientY);
    pointerStart=null;
  });
  canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    const directions={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0]};
    controls.setView(directions[button.dataset.view]);
    viewHistory.length=0;
    selected=null;
    selection.textContent='구조물을 클릭하면 선택한 요소를 확대합니다.';
  }));
  document.querySelector('#home').addEventListener('click',()=>{
    controls.home();
    controls.state.actions++;
    viewHistory.length=0;
    selected=null;
    selection.textContent='구조물을 클릭하면 선택한 요소를 확대합니다.';
  });
  document.querySelector('#free-view').addEventListener('click',()=>{controls.home();controls.state.actions++;viewHistory.length=0;selected=null;selection.textContent='구조물을 클릭하면 선택한 요소를 확대합니다.';});
  for(const p of model.tasks){const li=document.createElement('li');const title=document.createElement('strong');title.textContent=p.id+' '+p.name;li.append(title,document.createElement('br'),document.createTextNode(p.task));document.querySelector('#tasks').appendChild(li);}
  D.loop(()=>{
    const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    if(api.render)api.render(api);else drawView(controls.camera());
    const s=controls.state,camera=controls.camera(),value=`${s.orthographic?'직교 뷰':'원근 뷰'} · ${s.orthographic?'화면 높이 '+s.halfHeight.toFixed(2)+'m':'거리 '+s.distance.toFixed(2)+'m · FOV '+s.fov+'°'}\n카메라 좌표 (${camera.eye.map(v=>v.toFixed(2)).join(', ')}) · 관찰 중심 (${s.target.map(v=>v.toFixed(2)).join(', ')})\n측정 ${started===null?'시작 전':((performance.now()-started)/1000).toFixed(0)+'초'} · 조작 ${s.actions}회`;
    if(value!==last){read.textContent=value;last=value;}
  });
})();
