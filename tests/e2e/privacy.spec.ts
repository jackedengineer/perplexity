import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {identityFixture} from './identity-fixture';
test('owner can export, cancel deletion, then remove a disposable conversation',async({context,page},info)=>{
 const owner=await identityFixture(context,'Privacy Tester');
 try {
  const response=await context.request.post('/api/conversations',{headers:{Origin:'http://localhost:3000'},data:{clientRequestId:randomUUID(),title:'Disposable privacy test'}});
  expect(response.status()).toBe(201);const {conversation}=await response.json();
  await page.goto(`/search/${conversation.id}`);
  await page.getByRole('button',{name:'Conversation actions'}).click();
  const download=page.waitForEvent('download');
  await page.getByRole('menuitem',{name:'Export conversation',exact:true}).click();
  expect((await download).suggestedFilename()).toBe(`conversation-${conversation.id}.json`);
  await expect(page.getByRole('status').filter({hasText:'Export downloaded'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Delete conversation',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Delete this conversation?'});
  await expect(dialog.getByRole('button',{name:'Keep conversation'})).toBeFocused();
  expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button',{name:'Keep conversation'}).click();
  await expect(page.getByRole('button',{name:'Conversation actions'})).toBeFocused();
  await page.getByRole('button',{name:'Conversation actions'}).click();
  await page.getByRole('menuitem',{name:'Delete conversation',exact:true}).click();
  await dialog.getByRole('button',{name:'Delete conversation',exact:true}).click();
  await expect(page).toHaveURL(/\/library$/u);
  await expect(page.getByRole('link',{name:'Disposable privacy test',exact:true})).toHaveCount(0);
  expect((await context.request.get(`/api/conversations/${conversation.id}`)).status()).toBe(404);
  await page.goto(`/search/${conversation.id}`);
  await expect(page.getByRole('heading',{name:'This conversation is unavailable.'})).toBeVisible();
  await page.screenshot({path:`.artifacts/privacy-${info.project.name}.png`});
 }finally{await owner.cleanup();}
});
