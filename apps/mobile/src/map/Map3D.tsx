import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { color } from "@keyo/tokens";
import type { StatusTone } from "@keyo/shared";

/**
 * Carte 3D qui fonctionne dans Expo Go : MapLibre GL dans une WebView, tuiles OpenFreeMap
 * (gratuites, sans jeton), bâtiments en relief, caméra inclinée. Remplacée par Mapbox natif
 * dans un development build ; l'illustration isométrique prend le relais hors ligne.
 */
export type Map3DMarker = { id: string; name: string; lat: number; lng: number; tone: StatusTone; label?: string };

type Props = {
  markers: Map3DMarker[];
  focus?: { lat: number; lng: number };
  padding?: { top: number; bottom: number };
  onPressAsset?: (id: string) => void;
  /** Appelé si la carte ne peut pas se charger (hors ligne) : l'appelant affiche le secours. */
  onFail: () => void;
};

const TONE_DOT: Record<StatusTone, string> = {
  paid: color.dotPaid,
  late: color.dotLate,
  danger: color.dotDanger,
  info: color.sky,
  neutral: color.track,
};

const MAPLIBRE = "https://unpkg.com/maplibre-gl@5.24.1/dist";

function html(markers: Map3DMarker[], focus: Props["focus"], padding: { top: number; bottom: number }) {
  const data = JSON.stringify({ markers: markers.map((m) => ({ ...m, dot: TONE_DOT[m.tone] })), focus, padding });
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700&display=swap" rel="stylesheet">
<style>
  html,body,#map{margin:0;height:100%;background:#E4E9F0}
  .maplibregl-ctrl-attrib{font:10px sans-serif;opacity:.7}
  .pin{display:flex;flex-direction:column;align-items:center;cursor:pointer}
  .tag{display:flex;align-items:center;gap:8px;background:#fff;border-radius:999px;padding:0 14px;height:34px;
       font:700 14px 'Plus Jakarta Sans',system-ui,sans-serif;color:${color.night};white-space:nowrap;
       box-shadow:0 4px 10px rgba(11,27,51,.14)}
  .tag i{width:8px;height:8px;border-radius:8px;display:block}
  .ok{width:14px;height:14px;border-radius:22px;background:${color.mint};border:4px solid #fff;box-shadow:0 2px 6px rgba(11,27,51,.2)}
  .stem{width:2px;height:18px;background:${color.night}}
</style></head><body><div id="map"></div>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script>
(function(){
  var D=${data};
  var post=function(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m))};
  if(!window.maplibregl){post({type:'fail'});return;}
  var map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',
    center:D.focus?[D.focus.lng,D.focus.lat]:[-3.98,5.34],zoom:D.focus?16.4:11,pitch:D.focus?62:55,bearing:D.focus?20:-15,
    attributionControl:{compact:true},maxPitch:75});
  map.on('error',function(e){ if(e&&e.error&&/Failed to fetch|NetworkError/.test(String(e.error.message))) post({type:'fail'}); });
  map.on('load',function(){
    var st=map.getStyle();
    st.layers.forEach(function(l){
      // Ville calme, aux couleurs des maquettes : on retire les libellés de commerces et les icônes.
      if(l.type==='symbol' && !/water|place-city|place-town/.test(l.id)) map.setLayoutProperty(l.id,'visibility','none');
      if(l.type==='background') map.setPaintProperty(l.id,'background-color','#E4E9F0');
      if(/water/.test(l.id) && l.type==='fill') map.setPaintProperty(l.id,'fill-color','#BFD8F2');
      if(/park|landcover|landuse/.test(l.id) && l.type==='fill') map.setPaintProperty(l.id,'fill-opacity',0.35);
      if(l.type==='line' && /road|highway|street|minor|major|motorway|trunk|primary|secondary|tertiary/.test(l.id)) map.setPaintProperty(l.id,'line-color','#FFFFFF');
    });
    if(map.getLayer('building-3d')){
      map.setPaintProperty('building-3d','fill-extrusion-color','#D3DCE7');
      map.setPaintProperty('building-3d','fill-extrusion-opacity',0.92);
    }
    // Les biens : un bloc night extrudé, repère et étiquette au-dessus.
    var r=0.00028;
    map.addSource('keyo-assets',{type:'geojson',data:{type:'FeatureCollection',features:D.markers.map(function(m){
      return {type:'Feature',properties:{id:m.id},geometry:{type:'Polygon',coordinates:[[[m.lng-r,m.lat-r],[m.lng+r,m.lat-r],[m.lng+r,m.lat+r],[m.lng-r,m.lat+r],[m.lng-r,m.lat-r]]]}};
    })}});
    map.addLayer({id:'keyo-assets-3d',type:'fill-extrusion',source:'keyo-assets',paint:{
      'fill-extrusion-color':'${color.night}','fill-extrusion-height':45,'fill-extrusion-base':0,'fill-extrusion-opacity':0.95}});
    map.on('click','keyo-assets-3d',function(e){ var f=e.features&&e.features[0]; if(f) post({type:'press',id:f.properties.id}); });
    D.markers.forEach(function(m){
      var el=document.createElement('div'); el.className='pin';
      el.innerHTML=(m.label?'<div class="tag"><i style="background:'+m.dot+'"></i>'+m.label+'</div>':'<div class="ok"></div>')+'<div class="stem"></div>';
      el.addEventListener('click',function(ev){ev.stopPropagation();post({type:'press',id:m.id});});
      new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,-40]}).setLngLat([m.lng,m.lat]).addTo(map);
    });
    if(!D.focus && D.markers.length>1){
      var b=new maplibregl.LngLatBounds();
      D.markers.forEach(function(m){b.extend([m.lng,m.lat]);});
      map.fitBounds(b,{padding:{top:D.padding.top+70,bottom:D.padding.bottom+30,left:50,right:50},pitch:55,bearing:-15,duration:0,maxZoom:15.5});
    } else if(!D.focus && D.markers.length===1){
      map.jumpTo({center:[D.markers[0].lng,D.markers[0].lat],zoom:15.5});
    }
    post({type:'ready'});
  });
})();
</script></body></html>`;
}

export function Map3D({ markers, focus, padding = { top: 0, bottom: 0 }, onPressAsset, onFail }: Props) {
  const [ready, setReady] = useState(false);
  const failed = useRef(false);
  const fail = () => {
    if (failed.current) return;
    failed.current = true;
    onFail();
  };
  // Sans réponse de la carte au bout de 12 s (réseau lent ou absent), on bascule sur le secours.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(fail, 12_000);
    return () => clearTimeout(t);
  }, [ready]);
  // La page n'est reconstruite que si les biens ou leurs statuts changent.
  const key = JSON.stringify([markers, focus, padding]);
  const source = useMemo(() => ({ html: html(markers, focus, padding), baseUrl: "https://keyo.local/" }), [key]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string };
      if (msg.type === "ready") setReady(true);
      if (msg.type === "fail") fail();
      if (msg.type === "press" && msg.id) onPressAsset?.(msg.id);
    } catch {
      /* message inattendu : ignoré */
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        key={key}
        source={source}
        originWhitelist={["*"]}
        onMessage={onMessage}
        onError={fail}
        onHttpError={(e) => e.nativeEvent.url.includes("maplibre") && fail()}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: "transparent", opacity: ready ? 1 : 0 }}
        containerStyle={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}
