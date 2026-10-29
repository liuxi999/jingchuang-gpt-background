export function createRotationClock(win,advance) {
  let timer=0,minutes=0,held=true,remaining=0,deadline=0,disposed=false,generation=0;
  const now=()=>win.Date.now();
  function cancel(){if(timer)win.clearTimeout(timer);timer=0;}
  function schedule(){
    if(disposed||held||!minutes||timer)return;
    deadline=now()+remaining;
    const ticket=generation;
    timer=win.setTimeout(async()=>{
      timer=0;remaining=minutes*60000;
      try{await advance();}catch{/* Keep future rotations possible after a failed selection. */}
      if(ticket===generation)schedule();
    },remaining);
  }
  return {
    configure(value){const next=[1,5,15].includes(value)?value:0;if(next===minutes)return;generation++;cancel();minutes=next;remaining=minutes*60000;schedule();},
    hold(value){const next=!!value;if(next===held)return;held=next;if(held){if(timer)remaining=Math.max(0,deadline-now());cancel();}else schedule();},
    reset(){generation++;cancel();remaining=minutes*60000;schedule();},
    dispose(){disposed=true;generation++;cancel();}
  };
}
