import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://kipgnetwork.com';
const files=['index.html',...(await readdir(path.join(root,'pages'))).filter(f=>f.endsWith('.html')).map(f=>`pages/${f}`)];
const errors=[],titles=new Set(),descriptions=new Set(),indexable=[];
const htmls=new Map(await Promise.all(files.map(async file=>[file,await readFile(path.join(root,file),'utf8')])));
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map(m=>[m[1],m[2]]));
for(const [file,html] of htmls){
  const fail=message=>errors.push(`${file}: ${message}`);
  const titleTags=[...html.matchAll(/<title>([\s\S]*?)<\/title>/g)];
  const title=titleTags[0]?.[1];
  if(titleTags.length!==1||!title?.trim()||titles.has(title))fail('missing, duplicated or non-unique title');
  titles.add(title);
  const tags=[...html.matchAll(/<meta\b[^>]*>/g)].map(m=>attrs(m[0]));
  const descriptionsHere=tags.filter(t=>t.name==='description');
  const description=descriptionsHere[0]?.content;
  if(descriptionsHere.length!==1||!description?.trim()||descriptions.has(description))fail('missing, duplicated or non-unique description');
  descriptions.add(description);
  if([...html.matchAll(/<h1\b/g)].length!==1)fail('expected one first heading');
  const canonicalTags=[...html.matchAll(/<link\b[^>]*>/g)].map(m=>attrs(m[0])).filter(t=>t.rel==='canonical');
  const expected=`${origin}/${file==='index.html'?'':file}`;
  if(canonicalTags.length!==1||canonicalTags[0].href!==expected)fail('canonical URL must match the production page');
  const robots=tags.filter(t=>t.name==='robots');
  const privatePage=file==='pages/projector.html';
  if(robots.length!==1||robots[0].content!==(privatePage?'noindex, nofollow':'index, follow'))fail('incorrect indexing policy');
  if(!privatePage)indexable.push(expected);
  for(const property of ['og:title','og:description','og:url','og:image','og:image:alt']){
    const found=tags.filter(t=>t.property===property);
    if(found.length!==1||!found[0].content)fail(`missing or duplicated ${property}`);
  }
  if(tags.find(t=>t.property==='og:url')?.content!==expected)fail('share URL differs from canonical URL');
  for(const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
    const reference=match[1].replaceAll('&amp;','&');
    if(/^(https?:|data:|mailto:|tel:)/.test(reference))continue;
    const url=new URL(reference,`${origin}/${file}`);
    const target=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const absolute=path.resolve(root,target);
    if(!absolute.startsWith(root+path.sep)){fail(`link escapes site: ${reference}`);continue;}
    try{await stat(absolute);}catch{fail(`broken local reference: ${reference}`);continue;}
    if(url.hash&&target.endsWith('.html')){
      const content=htmls.get(target)||await readFile(absolute,'utf8');
      const ids=[...content.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
      if(!ids.includes(decodeURIComponent(url.hash.slice(1))))fail(`broken page anchor: ${reference}`);
    }
  }
}
const sitemap=await readFile(path.join(root,'sitemap.xml'),'utf8');
const listed=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
if(new Set(listed).size!==listed.length||listed.sort().join('\n')!==indexable.sort().join('\n'))errors.push('Sitemap must include exactly the indexable canonical pages.');
const robots=await readFile(path.join(root,'robots.txt'),'utf8');
if(!robots.includes(`Sitemap: ${origin}/sitemap.xml`)||/^Disallow:\s*\//m.test(robots))errors.push('Robots settings must allow crawling and advertise the production sitemap.');
async function checkTemplates(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await checkTemplates(file);
    else if(entry.name.endsWith('.html')&&!(await readFile(file,'utf8')).includes('name="robots" content="noindex, nofollow"'))errors.push(`${path.relative(root,file)}: template must be excluded from indexing`);
  }
}
await checkTemplates(path.join(root,'templates'));
if(errors.length){errors.forEach(e=>console.error(`FAIL ${e}`));process.exit(1);}
console.log(`SEO verification passed: ${files.length} site pages, ${indexable.length} sitemap URLs, local links and anchors checked.`);
