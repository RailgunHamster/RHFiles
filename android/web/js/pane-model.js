/* Geometry only: test without a WebView or device-model assumptions. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.paneLayout=value;})(globalThis,()=>{
  function available(){return {columns:true,rows:true};}
  function resolve(width,height,preference='auto'){
    // Geometry is a recommendation for Auto, never a restriction on manual use.
    const columns=width>=972&&height>=420,rows=width>=480&&height>=852;
    const automatic=columns&&rows?(width>=height?'columns':'rows'):columns?'columns':rows?'rows':'single';
    return {options:available(),mode:['single','columns','rows'].includes(preference)?preference:automatic};
  }
  return {available,resolve};
});
