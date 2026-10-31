import {expect,it,vi} from 'vitest';
import type {AnswerNode} from '@/server/answers/view';
import {prepareAnswerReveal,revealUnitsAt} from '@/components/conversations/answer-reveal';

const text=(value:string):AnswerNode=>({type:'text',text:value});
it('keeps approved content readable if the browser lacks word segmentation',()=>{
 const document:AnswerNode[]=[{type:'paragraph',children:[text('Still readable. 👩🏽‍💻')]}];
 vi.stubGlobal('Intl',{Segmenter:undefined});
 try{
  const reveal=prepareAnswerReveal(document);
  expect(reveal.total).toBe(0);
  expect(reveal.slice(0)).toBe(document);
 }finally{vi.unstubAllGlobals();}
});
it('reveals complete words without losing approved whitespace or inline structure',()=>{
 const document:AnswerNode[]=[{type:'paragraph',children:[text('  Light bends '),{type:'strong',children:[text('inside droplets')]},text(' again.\n')]}];
 const reveal=prepareAnswerReveal(document);
 expect(reveal.total).toBe(5);
 expect(reveal.slice(0)).toEqual([]);
 expect(reveal.slice(1)).toEqual([{type:'paragraph',children:[text('  Light ')]}]);
 expect(reveal.slice(3)).toEqual([{type:'paragraph',children:[text('  Light bends '),{type:'strong',children:[text('inside ')]}]}]);
 expect(reveal.slice(reveal.total)).toBe(document);
});
it('reveals citations atomically after their preceding text and never invents links',()=>{
 const reveal=prepareAnswerReveal([{type:'paragraph',children:[text('Evidence '),{type:'citation',number:2},text(' confirms it.')]}]);
 expect(JSON.stringify(reveal.slice(1))).not.toContain('citation');
 expect(reveal.slice(2)[0].children).toEqual([text('Evidence '),{type:'citation',number:2}]);
});
it('keeps list numbering, code, Unicode and block structure intact',()=>{
 const document:AnswerNode[]=[{type:'heading',depth:2,children:[text('कैसे काम करता है')]},{type:'list',ordered:true,start:5,children:[{type:'listItem',children:[{type:'paragraph',children:[{type:'inlineCode',text:'a + b'},text(' 👩🏽‍💻 café')]}]}]},{type:'code',text:'const x = 1;\nreturn x;'}];
 const before=JSON.stringify(document),reveal=prepareAnswerReveal(document);
 for(let units=1;units<reveal.total;units++){
  expect(JSON.stringify(reveal.slice(units))).not.toContain('�');
  const list=reveal.slice(units).find(n=>n.type==='list');
  if(list)expect(list).toMatchObject({ordered:true,start:5});
 }
 expect(reveal.slice(Infinity)).toBe(document);
 expect(JSON.stringify(document)).toBe(before);
});
it('handles empty documents and non-text blocks without empty wrapper flashes',()=>{
 expect(prepareAnswerReveal([]).slice(0)).toEqual([]);
 const reveal=prepareAnswerReveal([{type:'paragraph',children:[text('One')]},{type:'thematicBreak'},{type:'paragraph',children:[text('Two')]}]);
 expect(reveal.total).toBe(3);
 expect(reveal.slice(1)).toEqual([{type:'paragraph',children:[text('One')]}]);
 expect(reveal.slice(2).at(-1)).toEqual({type:'thematicBreak'});
});
it('bounds the reveal duration and catches up using elapsed time instead of frame counts',()=>{
 expect(revealUnitsAt(100,0)).toBe(1);
 expect(revealUnitsAt(100,900)).toBe(50);
 expect(revealUnitsAt(100,1800)).toBe(100);
 expect(revealUnitsAt(2000,4000)).toBe(2000);
 expect(revealUnitsAt(0,100)).toBe(0);
});
it('segments text without spaces while keeping emoji graphemes intact',()=>{
 const document:AnswerNode[]=[{type:'paragraph',children:[text('水循环将水输送到大气中。👩🏽‍💻')]}];
 const reveal=prepareAnswerReveal(document);
 expect(reveal.total).toBeGreaterThan(2);
 expect(reveal.slice(1)[0].children![0].text!.length).toBeLessThan(document[0].children![0].text!.length);
 for(let i=1;i<reveal.total;i++)expect(reveal.slice(i)[0].children![0].text).not.toMatch(/👩$|👩🏽$|\u200d$/u);
});
