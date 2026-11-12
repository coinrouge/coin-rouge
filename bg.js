/* Fond du site dessiné UNE fois, à la taille exacte des pixels de l'écran.
   Halos aux couleurs du logo, lignes de niveau, radar, quadrillage et grain, mais ensuite le navigateur
   n'a plus qu'une image 1:1 à afficher (pas de mélange ni de mise à l'échelle).
   Redessiné seulement quand la taille de la fenêtre change. */
(function(){
  var dpr=Math.min(window.devicePixelRatio||1,3), last=null, tm=0, c=null;
  var tile=new Image(); tile.src=dpr>=1.5?"grain2.png":"grain1.png";
  function bake(){
    var w=innerWidth,h=innerHeight;
    if(last&&last[0]===w&&last[1]===h) return;
    last=[w,h];
    if(!c){c=document.createElement("canvas");c.id="bgc";c.setAttribute("aria-hidden","true");
      c.style.cssText="position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block";}
    var W=Math.round(w*dpr),H=Math.round(h*dpr);c.width=W;c.height=H;
    var x=c.getContext("2d",{alpha:false}),M=Math.max(W,H);
    x.fillStyle="#0B0C12";x.fillRect(0,0,W,H);
    /* couleurs de la DA : bleu #1E90FF et rouge #E0121B du logo */
    [[98,60,44,"224,18,27",.42],[40,55,38,"224,18,27",.26],[55,10,34,"235,240,255",.18],[8,85,44,"30,144,255",.45]].forEach(function(g){
      var cx=g[0]/100*W,cy=g[1]/100*H,r=g[2]/100*M,gr=x.createRadialGradient(cx,cy,0,cx,cy,r);
      gr.addColorStop(0,"rgba("+g[3]+","+(g[4]*.855)+")");gr.addColorStop(.7,"rgba("+g[3]+",0)");
      x.fillStyle=gr;x.fillRect(0,0,W,H);
    });

    /* Lignes de niveau façon carte topographique (bruit de Perlin + marching squares) */
    (function(){
      var main=x,tc=document.createElement("canvas");tc.width=W;tc.height=H;x=tc.getContext("2d");
      var P=new Uint8Array(512),r=7;for(var i=0;i<256;i++)P[i]=i;
      for(i=255;i>0;i--){r=(r*16807)%2147483647;var j=r%(i+1),t=P[i];P[i]=P[j];P[j]=t;}for(i=0;i<256;i++)P[i+256]=P[i];
      function fd(t){return t*t*t*(t*(t*6-15)+10);}
      function gd(h,x,y){switch(h&7){case 0:return x+y;case 1:return -x+y;case 2:return x-y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y;}}
      function pn(x,y){var X=Math.floor(x),Y=Math.floor(y),xf=x-X,yf=y-Y;X&=255;Y&=255;var u=fd(xf),v=fd(yf),
        a=gd(P[P[X]+Y],xf,yf),b=gd(P[P[X+1]+Y],xf-1,yf),c=gd(P[P[X]+Y+1],xf,yf-1),d=gd(P[P[X+1]+Y+1],xf-1,yf-1);
        return (a+(b-a)*u)+((c+(d-c)*u)-(a+(b-a)*u))*v;}
      var st=Math.max(4,Math.round(5*dpr)),nx=Math.ceil(W/st)+1,ny=Math.ceil(H/st)+1,F=new Float32Array(nx*ny),k=1/(420*dpr);
      for(var yy=0;yy<ny;yy++)for(var xx=0;xx<nx;xx++){var X0=xx*st*k,Y0=yy*st*k;F[yy*nx+xx]=pn(X0,Y0)+.5*pn(X0*2.1+5.3,Y0*2.1+1.7)+.22*pn(X0*4.3+9.1,Y0*4.3+3.3);}
      var step=.085;
      function lines(major){x.beginPath();
        for(var yy=0;yy<ny-1;yy++)for(var xx=0;xx<nx-1;xx++){
          var a=F[yy*nx+xx],b=F[yy*nx+xx+1],c=F[(yy+1)*nx+xx+1],d=F[(yy+1)*nx+xx],
              lo=Math.min(a,b,c,d),hi=Math.max(a,b,c,d);
          for(var L=Math.ceil(lo/step);L*step<=hi;L++){if((L%5===0)!==major)continue;var v=L*step,pts=[],x0=xx*st,y0=yy*st;
            if((a<v)!==(b<v))pts.push(x0+st*(v-a)/(b-a),y0);
            if((b<v)!==(c<v))pts.push(x0+st,y0+st*(v-b)/(c-b));
            if((c<v)!==(d<v))pts.push(x0+st*(1-(v-c)/(d-c)),y0+st);
            if((d<v)!==(a<v))pts.push(x0,y0+st*(1-(v-d)/(a-d)));
            for(var q=0;q+3<pts.length;q+=4){x.moveTo(pts[q],pts[q+1]);x.lineTo(pts[q+2],pts[q+3]);}}}
      }
      x.lineCap="round";
      lines(false);x.strokeStyle="rgba(255,255,255,0.0231)";x.lineWidth=Math.max(1,dpr*.9);x.stroke();
      lines(true);x.strokeStyle="rgba(255,255,255,0.0385)";x.lineWidth=Math.max(1,dpr*1.15);x.stroke();
      /* estompée aux abords du radar (même centre et rayon que le radar bleu) */
      var RX=W*.08,RY=H*.85,RR=Math.max(W,H)*.44*.7,m=x.createRadialGradient(RX,RY,0,RX,RY,RR*1.35);
      m.addColorStop(0,"rgba(0,0,0,1)");m.addColorStop(.6,"rgba(0,0,0,1)");m.addColorStop(1,"rgba(0,0,0,0)");
      x.globalCompositeOperation="destination-out";x.fillStyle=m;x.fillRect(0,0,W,H);
      x=main;x.drawImage(tc,0,0);
    })();
    /* Radar (cercles, rayons, graduations, balayage figé) */
    (function(){
      var M=Math.max(W,H),u=dpr;
      function scope(cx,cy,R,rings,ang){
        x.save();
        /* traînée du balayage, figée */
        var g=x.createConicGradient?x.createConicGradient(ang,cx,cy):null;
        if(g){g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(.86,"rgba(255,255,255,0)");g.addColorStop(.999,"rgba(255,255,255,0.035)");g.addColorStop(1,"rgba(255,255,255,0)");
          x.fillStyle=g;x.beginPath();x.arc(cx,cy,R,0,Math.PI*2);x.fill();}
        x.strokeStyle="rgba(255,255,255,0.0616)";x.lineWidth=Math.max(1,.9*u);
        for(var k=1;k<=rings;k++){x.beginPath();x.arc(cx,cy,R*k/rings,0,Math.PI*2);x.stroke();}
        x.beginPath();for(var a=0;a<12;a++){var t=a*Math.PI/6;x.moveTo(cx+Math.cos(t)*R/rings*.5,cy+Math.sin(t)*R/rings*.5);x.lineTo(cx+Math.cos(t)*R,cy+Math.sin(t)*R);}
        x.strokeStyle="rgba(255,255,255,0.041)";x.stroke();
        /* graduations sur le cercle extérieur */
        x.beginPath();for(a=0;a<72;a++){var t2=a*Math.PI/36,l=a%6===0?R*.045:R*.02;x.moveTo(cx+Math.cos(t2)*R,cy+Math.sin(t2)*R);x.lineTo(cx+Math.cos(t2)*(R-l),cy+Math.sin(t2)*(R-l));}
        x.strokeStyle="rgba(255,255,255,0.0923)";x.stroke();
        /* ligne du balayage */
        x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(ang)*R,cy+Math.sin(ang)*R);x.strokeStyle="rgba(255,255,255,0.06)";x.lineWidth=Math.max(1,1.2*u);x.stroke();
        /* quelques échos */
        x.fillStyle="rgba(255,255,255,0.0821)";[[.35,.7],[.62,.45],[.8,.9]].forEach(function(p){var t3=ang-p[1],r3=R*p[0];x.beginPath();x.arc(cx+Math.cos(t3)*r3,cy+Math.sin(t3)*r3,2.2*u,0,Math.PI*2);x.fill();});
        x.restore();
      }
      /* un seul radar, sur le halo bleu en bas à gauche (même centre, taille de la partie visible du halo) */
      scope(W*.08,H*.85,M*.44*.7,6,-0.9);
      /* fine grille de repérage en fond */
      x.beginPath();var gs=32*u;for(var gx=gs;gx<W;gx+=gs){x.moveTo(gx,0);x.lineTo(gx,H);}for(var gy=gs;gy<H;gy+=gs){x.moveTo(0,gy);x.lineTo(W,gy);}
      x.strokeStyle="rgba(255,255,255,0.0143)";x.lineWidth=1;x.stroke();
    })();
    x.fillStyle="rgba(0,0,0,.3)";x.fillRect(0,0,W,H);
    var p=x.createPattern(tile,"repeat"),s=240*dpr/tile.naturalWidth;
    if(p.setTransform)p.setTransform(new DOMMatrix([s,0,0,s,0,0]));
    x.globalCompositeOperation="soft-light";x.fillStyle=p;x.fillRect(0,0,W,H);x.globalCompositeOperation="source-over";
    if(!c.parentNode){document.body.prepend(c);document.documentElement.classList.add("bgbaked");}
    /* Copie en image (sans bloquer la page) pour la fiche de soirée qui glisse au retour */
    if(c.toBlob)c.toBlob(function(b){if(!b)return;var u=URL.createObjectURL(b),R=document.documentElement;
      if(R._bgu)URL.revokeObjectURL(R._bgu);R._bgu=u;R.style.setProperty("--bgbake",'url("'+u+'")');R.classList.add("bgcopy");},"image/jpeg",.92);
  }
  function go(){if(tile.complete&&tile.naturalWidth)bake();else tile.onload=bake;}
  addEventListener("resize",function(){clearTimeout(tm);tm=setTimeout(go,300);});
  go();
})();
