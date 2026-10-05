import {getCommunityClient,communityError} from './community-client.js?v=20261003-shared';
export function attachModeration(view,refresh){
  const panel=document.createElement('section');panel.className='vr-moderation-panel';panel.hidden=true;
  panel.innerHTML='<h2>Private moderation review</h2><p>Visible to authorized staff. Hiding never sends a notice to the member.</p><button type="button" class="kipg-btn kipg-btn--outline" data-review-refresh>Refresh incidents</button><p data-review-status role="status"></p><div data-review-list></div>';
  document.querySelector('.vr-program').after(panel);
  const dialog=document.createElement('dialog');dialog.className='vr-moderation-dialog';
  dialog.innerHTML='<form><h2>Moderate this message</h2><p data-target-user></p><blockquote data-target-text></blockquote><label>Reason<select name="reason" required><option>Harassment</option><option>Hate speech</option><option>Threats</option><option>Profanity</option><option>Spam</option><option>Other</option></select></label><label>Private note<textarea name="note" maxlength="1000" rows="3"></textarea></label><label class="vr-checkbox"><input name="serious" type="checkbox"> Serious abuse: hide indefinitely now</label><p>Hide progression: rest of show → seven days → indefinite. One hide incident per member per show. No notice is shown to the member.</p><div class="vr-projector-actions"><button class="kipg-btn" name="action" value="hide">Hide User</button><button class="kipg-btn kipg-btn--outline" name="action" value="remove">Remove message</button><button type="button" class="kipg-btn kipg-btn--outline" data-dialog-close>Cancel</button></div><p data-dialog-status role="status"></p></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form');let caps={},target=null,busy=false,reviewTicket=0;
  const open=message=>{if(!caps.moderator)return;target=message;form.reset();dialog.querySelector('[data-target-user]').textContent=message.username;dialog.querySelector('[data-target-text]').textContent=message.text;dialog.querySelector('[data-dialog-status]').textContent='';dialog.showModal();};
  const close=()=>{if(!busy)dialog.close();};dialog.querySelector('[data-dialog-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!target||!caps.moderator)return;busy=true;
    const status=dialog.querySelector('[data-dialog-status]');for(const b of form.querySelectorAll('button'))b.disabled=true;
    try{
      const client=await getCommunityClient();const {error}=await client.rpc('kipg_moderate_message',{target_message:target.id,operation:event.submitter?.value||'hide',explanation:form.elements.reason.value,moderator_note:form.elements.note.value,serious:form.elements.serious.checked});
      if(error)throw error;dialog.close();await refresh();await review();
    }catch(error){status.textContent=communityError(error);}finally{busy=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}
  });
  async function restore(incident,reverse){
    if(!caps.administrator)return;
    const note=prompt(reverse?'Why was this action mistaken? Reversing removes its strike.':'Why should this restriction be lifted? Its strike remains.');
    if(!note?.trim())return;
    const buttonStatus=panel.querySelector('[data-review-status]');
    try{const client=await getCommunityClient();const {error}=await client.rpc('kipg_restore_incident',{target_incident:incident.id,reverse_mistake:reverse,review_explanation:note.trim()});if(error)throw error;await review();await refresh();}
    catch(error){buttonStatus.textContent=communityError(error);}
  }
  async function review(){
    if(!caps.moderator)return;const ticket=++reviewTicket;
    const status=panel.querySelector('[data-review-status]');status.textContent='Loading private incidents…';
    try{
      const client=await getCommunityClient();const {data,error}=await client.rpc('kipg_review_incidents');if(error)throw error;if(ticket!==reviewTicket||!caps.moderator)return;
      const list=panel.querySelector('[data-review-list]');list.replaceChildren();
      for(const incident of data||[]){
        const card=document.createElement('details');card.className='vr-incident';
        const summary=document.createElement('summary');const state=incident.reversed_at?'Mistake reversed':incident.restored_at?'Restored':incident.action==='remove'?'Message removed':incident.until_at&&Date.parse(incident.until_at)<=Date.now()?'Expired':'Hidden';
        summary.textContent=`${incident.username||'Member'} · ${state} · ${incident.reason}${incident.strike?` · Incident ${incident.strike}`:''}`;card.append(summary);
        const add=text=>{const p=document.createElement('p');p.textContent=text;card.append(p);};
        add(`${incident.show_title} · ${new Date(incident.created_at).toLocaleString()} · Moderator: ${incident.moderator_username||'Staff'}`);
        add(`Duration: ${incident.until_at?new Date(incident.until_at).toLocaleString():'Indefinite / message removal'}`);
        const quote=document.createElement('blockquote');quote.textContent=incident.evidence?.body||'';card.append(quote);
        add(`Private note: ${incident.note||'None'}`);if(incident.review_note)add(`Review: ${incident.review_note}`);
        const context=document.createElement('details');const heading=document.createElement('summary');heading.textContent='Conversation evidence and recent messages';context.append(heading);
        for(const row of [...(incident.context||[]),...(incident.recent_messages||[])]){const p=document.createElement('p');p.textContent=`${row.username}: ${row.body}`;context.append(p);}card.append(context);
        if(caps.administrator&&!incident.reversed_at){
          if(incident.action==='hide'&&!incident.restored_at){const unhide=document.createElement('button');unhide.type='button';unhide.className='kipg-btn kipg-btn--outline';unhide.textContent='Unhide User';unhide.addEventListener('click',()=>restore(incident,false));card.append(unhide);}
          const reverse=document.createElement('button');reverse.type='button';reverse.className='kipg-btn kipg-btn--outline';reverse.textContent='Reverse mistaken action';reverse.addEventListener('click',()=>restore(incident,true));card.append(reverse);
        }
        list.append(card);
      }
      status.textContent=data?.length?`${data.length} recent incidents. Open a row to review the evidence.`:'No moderation incidents yet.';
    }catch(error){if(ticket===reviewTicket&&caps.moderator)status.textContent=communityError(error);}
  }
  panel.querySelector('[data-review-refresh]').addEventListener('click',review);
  return {setAccess(next){const became=next.moderator&&!caps.moderator;caps=next;panel.hidden=!caps.moderator;view.setModerator?.(caps.moderator?open:null);if(!caps.moderator){reviewTicket++;panel.querySelector('[data-review-list]').replaceChildren();dialog.close();target=null;}if(became)void review();}};
}
