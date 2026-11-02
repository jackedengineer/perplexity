import {expect,test} from '@playwright/test';

test('cached public pages retain security headers and dynamic surfaces stay private',async({request})=>{
 for(const path of ['/','/privacy','/terms']){
  const response=await request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
 }
 for(const path of ['/sign-in','/reviewer-sign-in','/workspace','/api/models','/api/usage','/api/conversations','/api/runs/00000000-0000-4000-8000-000000000001']){
  const response=await request.get(path);
  expect(response.headers()['cache-control']).toContain('no-store');
  if(path.startsWith('/api/'))expect(response.status()).toBe(401);
 }
});
