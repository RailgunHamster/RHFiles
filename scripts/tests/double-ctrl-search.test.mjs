import test from 'node:test';
import assert from 'node:assert/strict';
import {context, load} from '../testing/source.mjs';

function fixture() {
  const handlers = {}, focuses = [];
  let now = 1000;
  const input = {focus:()=>focuses.push(now), select:()=>{}};
  const ctx = context({performance:{now:()=>now}, Date:{now:()=>now},
    window:{addEventListener:(type,fn)=>(handlers['window:'+type]??=[]).push(fn)},
    document:{activeElement:{}, getElementById:()=>input,
      addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn)}});
  load(ctx, 'tabs.js', ['initDoubleCtrlSearch']);
  ctx.initDoubleCtrlSearch();
  const fire = (type, extra={}) => {
    now += 10;
    for (const fn of handlers[type] || []) fn({key:'Control', location:1, ...extra});
  };
  const tap = () => {fire('keydown'); fire('keyup');};
  return {fire, tap, focuses, advance:ms=>{now+=ms;}};
}

test('Ctrl+click followed immediately by Ctrl+Shift+C must not focus search',()=>{
  const {fire, focuses} = fixture();
  fire('keydown'); fire('pointerdown', {ctrlKey:true}); fire('keyup');
  fire('keydown'); fire('keydown', {key:'Shift',ctrlKey:true,shiftKey:true});
  fire('keydown', {key:'C',ctrlKey:true,shiftKey:true});
  fire('keyup', {key:'C',ctrlKey:true,shiftKey:true});
  fire('keyup', {key:'Shift',ctrlKey:true}); fire('keyup');
  assert.deepEqual(focuses, []);
});

test('Ctrl+click followed by Ctrl+Delete must not focus search',()=>{
  const {fire, focuses} = fixture();
  fire('keydown'); fire('pointerdown', {ctrlKey:true}); fire('keyup');
  fire('keydown'); fire('keydown', {key:'Delete',ctrlKey:true}); fire('keyup');
  assert.deepEqual(focuses, []);
});

test('double Ctrl means two clean taps, not the start of another modifier chord',()=>{
  const {fire, tap, focuses} = fixture();
  tap(); fire('keydown');
  assert.deepEqual(focuses, [], 'Do not steal focus before the second Ctrl is released');
  fire('keydown', {key:'c',ctrlKey:true}); fire('keyup');
  assert.deepEqual(focuses, []);
  tap(); tap(); assert.equal(focuses.length, 1);
});

for (const interruption of ['pointerdown','other-key','repeat','blur','hold','right-control','modified-control','timeout']) {
  test(`double Ctrl does not survive ${interruption}`,()=>{
    const {fire,tap,focuses,advance} = fixture();
    if (interruption === 'right-control') {
      for(let i=0;i<2;i++){fire('keydown',{location:2});fire('keyup',{location:2});}
    } else if (interruption === 'modified-control') {
      for(let i=0;i<2;i++){fire('keydown',{shiftKey:true});fire('keyup',{shiftKey:true});}
    } else {
      tap();
      if(interruption==='pointerdown') fire('pointerdown');
      if(interruption==='other-key') fire('keydown',{key:'Shift',shiftKey:true});
      if(interruption==='blur') fire('window:blur');
      if(interruption==='timeout') advance(400);
      fire('keydown');
      if(interruption==='hold') advance(400);
      if(interruption==='repeat') fire('keydown',{repeat:true});
      fire('keyup');
    }
    assert.deepEqual(focuses, []);
  });
}
