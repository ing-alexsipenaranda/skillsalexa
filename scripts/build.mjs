import {build} from 'esbuild';
import {mkdir,cp,writeFile} from 'node:fs/promises';
await mkdir('dist/lambda',{recursive:true});
await mkdir('dist/alexa-hosted/lambda',{recursive:true});
await mkdir('dist/linking',{recursive:true});
await build({entryPoints:['src/index.js'],bundle:true,platform:'node',target:'node22',outfile:'dist/lambda/index.js'});
await build({entryPoints:['src/hosted.js'],bundle:true,platform:'node',target:'node16',outfile:'dist/alexa-hosted/lambda/index.js'});
await build({entryPoints:['linking/app.js'],bundle:true,platform:'browser',target:'es2020',outfile:'dist/linking/app.js',minify:true});
await cp('linking/index.html','dist/linking/index.html');
await cp('skill-package','dist/skill-package',{recursive:true});
await writeFile('dist/lambda/package.json',JSON.stringify({type:'commonjs',main:'index.js'}));
await writeFile('dist/alexa-hosted/lambda/package.json',JSON.stringify({
  name:'evoll-alexa-hosted',version:'0.1.0',private:true,main:'index.js',type:'commonjs',dependencies:{},
},null,2));
console.log('Built self-managed Lambda, Alexa-hosted Lambda, linking page and skill package');
