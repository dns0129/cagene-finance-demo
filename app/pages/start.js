// The Node server marks its own workspace. Static Pages uses the local demo transport.
if (!document.body.hasAttribute('data-account-workspace')) {
  document.body.setAttribute('data-account-workspace','required');
  document.body.setAttribute('data-demo-workspace','');
  const moduleURL=new URL('runtime.mjs',document.currentScript.src);
  window.pagesDemoRequest=async (path,options)=>(await import(moduleURL)).request(path,options);
}
