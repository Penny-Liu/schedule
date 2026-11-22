import {afterEach,describe,expect,it,vi} from 'vitest';
import {db} from './store';
const store=db as any;
afterEach(()=>{vi.restoreAllMocks();store.authLoadInFlight=null;store.isLoaded=false;});
describe('startup auth request sharing',()=>{
 it('shares overlapping initial and forced loads and permits the next forced refresh',async()=>{
  store.isLoaded=false;
  let finish!:()=>void;
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  const load=vi.spyOn(store,'loadAuthData').mockImplementation(async()=>{await gate;store.isLoaded=true;});
  const requests=[db.initializeAuthData(),db.initializeAuthData(),db.initializeAuthData(true)];
  expect(load).toHaveBeenCalledTimes(1);
  finish();await Promise.all(requests);
  await db.initializeAuthData();expect(load).toHaveBeenCalledTimes(1);
  await db.initializeAuthData(true);expect(load).toHaveBeenCalledTimes(2);
 });
 it('clears the ongoing request after failure so a retry can succeed',async()=>{
  store.isLoaded=false;
  const load=vi.spyOn(store,'loadAuthData').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
  await expect(db.initializeAuthData()).rejects.toThrow('network');
  await expect(db.initializeAuthData(true)).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledTimes(2);
 });
});
