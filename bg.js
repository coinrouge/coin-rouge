/* Fond du site dessiné UNE fois, à la taille exacte des pixels de l'écran.
   Mêmes dégradés + même grain que la version CSS, mais ensuite le navigateur
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
    [[98,60,44,"255,30,50",.40],[40,55,38,"230,40,90",.30],[55,10,34,"255,220,235",.22],[8,85,44,"30,80,200",.55]].forEach(function(g){
      var cx=g[0]/100*W,cy=g[1]/100*H,r=g[2]/100*M,gr=x.createRadialGradient(cx,cy,0,cx,cy,r);
      gr.addColorStop(0,"rgba("+g[3]+","+g[4]+")");gr.addColorStop(.7,"rgba("+g[3]+",0)");
      x.fillStyle=gr;x.fillRect(0,0,W,H);
    });
    x.fillStyle="rgba(0,0,0,.3)";x.fillRect(0,0,W,H);
    var p=x.createPattern(tile,"repeat"),s=240*dpr/tile.naturalWidth;
    if(p.setTransform)p.setTransform(new DOMMatrix([s,0,0,s,0,0]));
    x.globalCompositeOperation="soft-light";x.fillStyle=p;x.fillRect(0,0,W,H);x.globalCompositeOperation="source-over";
    if(!c.parentNode){document.body.prepend(c);document.documentElement.classList.add("bgbaked");}
  }
  function go(){if(tile.complete&&tile.naturalWidth)bake();else tile.onload=bake;}
  addEventListener("resize",function(){clearTimeout(tm);tm=setTimeout(go,300);});
  go();
})();
