const fs=require('node:fs');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.SPORTSFEST_NODE_MODULES || 'C:/Users/tamon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<canvas></canvas>');
    await page.addScriptTag({content:fs.readFileSync('export-assets.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('admin-export.js','utf8')});
    const result=await page.evaluate(async()=>{
      const teams=[{id:'SBA',name:'Surging Dragons',points:118},{id:'SECSA',name:'Shippuden',points:102},{id:'SHTM',name:'Pink Panthers',points:71},{id:'STED',name:'Golden Hawks',points:60},{id:'SHARP',name:'Celadons Hawks',points:60}].map(t=>({...t,logo:'bundled'}));
      const group={short:'College',teams};
      const [logos,brand]=await Promise.all([leaderboardPhotoLogos(group),leaderboardBrandAssets()]);
      if(!teams.every(t=>logos[t.id])) throw new Error('Missing team logo');
      if(!document.fonts.check('700 40px Quicksand')) throw new Error('Quicksand not loaded');
      const canvas=document.querySelector('canvas');drawLeaderboardPhoto(canvas,group,{},logos,brand);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync('facebook-style-preview.png',Buffer.from(result,'base64'));
    console.log('PASS: Sportsfest SVG, 5 team logos, Quicksand, and PNG export with bundled assets. Preview uses sample scores.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
