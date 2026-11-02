import {expect,it,vi} from 'vitest';
import {createRazorpay} from '@/server/payments/razorpay';
const sub={id:'sub_fixture',plan_id:'plan_fixture',quantity:1,notes:{checkoutId:'b0f264b0-0b7a-4b15-b6b7-96e9dce45731',priceKey:'pro-live-monthly-inr-v1'}};
const config={keyId:'rzp_live_fixture',keySecret:'synthetic-secret',allowLive:true};
it.each([['created',0],['authenticated',1],['active',1],['pending',1],['halted',1]])('cancels %s using provider-appropriate timing',async(status,timing)=>{
 const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({...sub,status})).mockResolvedValueOnce(Response.json({...sub,status:'cancelled'}));
 expect((await createRazorpay(config,request).cancel(sub.id)).status).toBe('cancelled');
 expect(request.mock.calls.map(([,init])=>init?.method)).toEqual(['GET','POST']);
 expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({cancel_at_cycle_end:timing});
});
it.each(['cancelled','completed','expired'])('reconciles already %s without another cancellation',async(status)=>{
 const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({...sub,status}));
 expect((await createRazorpay(config,request).cancel(sub.id)).status).toBe(status);expect(request).toHaveBeenCalledOnce();
});
it('does not cancel when the authoritative read fails or returns another subscription',async()=>{
 for(const response of [new Response('{}',{status:503}),Response.json({...sub,id:'sub_other',status:'created'})]){
  const request=vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(createRazorpay(config,request).cancel(sub.id)).rejects.toThrow();expect(request).toHaveBeenCalledOnce();
 }
});
