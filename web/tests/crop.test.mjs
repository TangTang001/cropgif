import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagePoint, move, resize, squareRect, dimensions } from '../src/crop/geometry.js';
const image = { width: 800, height: 500 };
test('coordinate scaling and rounding account for fractional display and scroll', () => {
  assert.deepEqual(imagePoint(221.25,160,{left:21.25,top:-40,width:400,height:250},image), {x:400,y:400});
  assert.deepEqual(move({x:120,y:70,width:560,height:360},0.6,-0.6,image), {x:121,y:69,width:560,height:360});
});
test('freeform moves and edges stop at boundaries and one pixel', () => {
  const r={x:100,y:80,width:300,height:200};
  assert.deepEqual(move(r,10000,-10000,image), {x:500,y:0,width:300,height:200});
  assert.deepEqual(resize(r,'nw',10000,10000,image), {x:399,y:279,width:1,height:1});
  assert.deepEqual(resize(r,'se',10000,10000,image), {x:100,y:80,width:700,height:420});
  assert.deepEqual(resize(r,'w',-10000,0,image), {x:0,y:80,width:400,height:200});
  assert.deepEqual(resize(r,'n',0,-10000,image), {x:100,y:0,width:300,height:280});
});
test('larger dimensions shift the origin inward only as needed', () => {
  assert.deepEqual(dimensions({x:500,y:350},600,400,image), {x:200,y:100,width:600,height:400});
});
test('square toggle centers the inscribed square with integer rounding', () => {
  assert.deepEqual(squareRect({x:120,y:70,width:561,height:360}), {x:221,y:70,width:360,height:360});
});
test('square corners keep the opposite anchor without flipping', () => {
  const r={x:200,y:100,width:200,height:200};
  assert.deepEqual(resize(r,'nw',50,80,image,true), {x:280,y:180,width:120,height:120});
  assert.deepEqual(resize(r,'se',10000,10000,image,true), {x:200,y:100,width:400,height:400});
  assert.deepEqual(resize(r,'sw',10000,-10000,image,true), {x:399,y:100,width:1,height:1});
});
test('square sides handle odd sizes and all handles stay in bounds', () => {
  const rect={x:200,y:100,width:201,height:201};
  assert.deepEqual(resize(rect,'e',10,0,image,true), {x:200,y:95,width:211,height:211});
  for (const h of ['nw','n','ne','e','se','s','sw','w']) for (const [dx,dy] of [[-10000,-10000],[10000,10000],[-3,2]]) {
    const r=resize(rect,h,dx,dy,image,true);
    assert.equal(r.width,r.height); assert.ok(r.width>=1 && Object.values(r).every(Number.isInteger));
    assert.ok(r.x>=0 && r.y>=0 && r.x+r.width<=image.width && r.y+r.height<=image.height);
  }
});
