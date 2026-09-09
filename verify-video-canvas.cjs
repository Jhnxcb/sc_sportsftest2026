const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.SPORTSFEST_NODE_MODULES || 'C:/Users/tamon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<style>.signage-video-canvas{width:640px;height:360px}</style><video muted playsinline></video>');
    await page.addScriptTag({content:fs.readFileSync('video-canvas.js','utf8')});
    for(const fallback of [false,true]) {
      await page.evaluate(async fallback=>{
        const old=document.querySelector('video');old.pause();old.disposeSignage?.();
        document.querySelector('.signage-video-canvas')?.remove();
        const video=document.createElement('video');video.muted=true;video.playsInline=true;old.replaceWith(video);
        if(fallback) video.requestVideoFrameCallback=undefined;
        const source=document.createElement('canvas');source.width=640;source.height=360;
        const ctx=source.getContext('2d');ctx.fillStyle='#f03010';ctx.fillRect(0,0,640,360);
        video.srcObject=source.captureStream(30);
        window.source=source;window.attachSignageVideo(video);await video.play();
      },fallback);
      await page.waitForFunction(()=>{
        const canvas=document.querySelector('.signage-video-canvas');
        return canvas && canvas.getContext('2d').getImageData(100,100,1,1).data[0]>200;
      });
      assert.equal(await page.locator('video').evaluate(v=>v.controls),false);
      await page.evaluate(()=>{
        const v=document.querySelector('video');v.pause();v.disposeSignage();v.srcObject.getTracks().forEach(t=>t.stop());
      });
    }
    console.log('PASS: video frames render to canvas with video-frame and older-browser animation callbacks; controls disabled and cleanup runs.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
