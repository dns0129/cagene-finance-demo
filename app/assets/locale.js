/* Presentation-only locale: never converts data passed through literal(). */
(() => {
'use strict';
const KEY='acct2102-interface-locale-v1', CN='zh-CN', HK='zh-HK';
const valid = value => value===CN || value===HK;
const query = new URLSearchParams(location.search).get('lang');
let current=CN, converter;
try { const saved=localStorage.getItem(KEY); if (valid(saved)) current=saved; } catch(e) {}
if (valid(query)) {
  current=query;
  try { localStorage.setItem(KEY,current); } catch(e) {}
}

function traditional(value) {
  const s=String(value ?? '');
  if (!/\p{Script=Han}/u.test(s)) return s;
  converter ||= window.OpenCC.Converter({from:'cn',to:'hk'});
  return converter(s).replace(/賬/g,'帳').replace(/户/g,'戶');
}
const text = value => current===HK ? traditional(value) : String(value ?? '');
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Numeric entities decode to exactly the original characters in DOM text and form values.
function literal(value) {
  const s=escape(value);
  return current===HK ? s.replace(/\p{Script=Han}/gu,c=>'&#'+c.codePointAt(0)+';') : s;
}
const attributes=['aria-label','title','placeholder','label','alt'];
const attrSet=new Set(attributes);
// Template markup is trusted; data interpolated into it must use literal().
function markup(html) {
  if (current!==HK || !html) return html;
  const tags=/<\/?[a-z](?:[^"'<>]|"[^"]*"|'[^']*')*>|<!--[\s\S]*?-->/gi;
  let result='', cursor=0;
  for (const match of html.matchAll(tags)) {
    result+=text(html.slice(cursor,match.index));
    const tag=match[0];
    result+=tag.startsWith('<!--') ? tag : tag.replace(/\s+[\w:-]+\s*=\s*("[^"]*"|'[^']*')/g,attribute=>{
      const name=attribute.slice(0,attribute.indexOf('=')).trim().toLowerCase();
      if (!attrSet.has(name)) return attribute;
      const open=attribute.search(/["']/);
      return attribute.slice(0,open+1)+text(attribute.slice(open+1,-1))+attribute.at(-1);
    });
    cursor=match.index+tag.length;
  }
  return result+text(html.slice(cursor));
}

// These regions are static in index.html. Keep their original strings for switching back.
const shell=[];
function registerShell() {
  if (shell.length) return;
  const staticRegions='.skip-link, .rail-brand, .primary-nav, .rail-bottom, .workspace-footer, #mobileJump';
  for (const element of document.querySelectorAll(attributes.map(name=>'['+name+']').join(','))) {
    for (const name of attributes) if(element.hasAttribute(name)) shell.push([element,name,element.getAttribute(name)]);
  }
  for (const root of document.querySelectorAll(staticRegions)) {
    for (const element of [root,...root.querySelectorAll('*')]) {
      for (const node of element.childNodes) if(node.nodeType===3 && /\p{Script=Han}/u.test(node.nodeValue)) shell.push([node,null,node.nodeValue]);
    }
  }
}
function applyShell() {
  registerShell();
  document.documentElement.lang=current;
  for(const [node,attr,value] of shell) {
    if(attr) node.setAttribute(attr,text(value)); else node.nodeValue=text(value);
  }
}
function set(value) {
  if (!valid(value)) return;
  current=value;
  try { localStorage.setItem(KEY,value); } catch(e) {}
  try {
    const url=new URL(location.href);
    if(value===HK)url.searchParams.set('lang',HK);else url.searchParams.delete('lang');
    history.replaceState(null,'',url);
  } catch(e) {}
  applyShell();
}
window.AccountingLocale={get current(){return current;},set,applyShell,text,traditional,markup,escape,literal};
})();
