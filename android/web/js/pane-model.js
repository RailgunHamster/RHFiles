/* Geometry only: test without a WebView or device-model assumptions. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.paneLayout=value;})(globalThis,()=>{
  function available(width,height){return {columns:width>=972&&height>=420,rows:width>=480&&height>=852};}
  function resolve(width,height,preference='auto'){
    const options=available(width,height);
    const automatic=options.columns&&options.rows?(width>=height?'columns':'rows'):options.columns?'columns':options.rows?'rows':'single';
    return {options,mode:preference==='single'?'single':options[preference]?preference:automatic};
  }
  return {available,resolve};
});
