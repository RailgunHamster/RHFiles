const androidNearby=(()=>{
  let app,controller,selection=[],folder;
  function init(context){app=context}
  async function open(paths=[]){selection=paths.filter(path=>!api.isVirtual(path));folder=app.state.route.screen==='folder'&&!api.isVirtual(app.state.route.path)?app.state.route.path:null;await app.go({screen:'tool',tool:'nearby'});}
  function render(root){controller?.destroy();controller=nearbyView.mount(root,{call:api.raw,lifetime:enabled=>api.native('nearby.keepAlive',{enabled}),paths:selection,folder,destination:app.state.root+'/Download',defaultAlias:'我的手机',lang:'zh-CN',formatSize:fmt.size,otherFolder:()=>{const route=workbench.parentHost()?.other(window)?.route;return route?.screen==='folder'&&!api.isVirtual(route.path)?route.path:null},open:path=>app.go({screen:'folder',path})});}
  return {init,open,render,back:()=>controller?.back()===true,leave(){controller?.destroy();controller=null}};
})();
