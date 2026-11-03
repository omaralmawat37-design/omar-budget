(function(){
  let editingManualSavingId = null;
  let migrationSaveQueued = false;

  function manualSavingsEntries(){
    if(!Array.isArray(data.settings.savingsEntries)) data.settings.savingsEntries = [];
    data.settings.savingsEntries = data.settings.savingsEntries.map(item=>({...item,type:item.type==='withdraw'?'withdraw':'deposit'}));
    return data.settings.savingsEntries;
  }

  function signedAmount(item){
    const amount = Number(item.amount)||0;
    return item.type==='withdraw' ? -amount : amount;
  }

  function manualSavingsTotal(excludeId=null){
    return manualSavingsEntries().filter(item=>String(item.id)!==String(excludeId)).reduce((sum,item)=>sum+signedAmount(item),0);
  }

  function syncManualSavingsTotal(){
    const total = manualSavingsTotal();
    data.settings.savingsOpeningUsd = total;
    data.settings.manualSavingsUsd = total;
    return total;
  }

  function ensureManualSavingsLedger(){
    if(data.settings.savingsLedgerInitialized) return false;
    const existing = Number(data.settings.manualSavingsUsd ?? data.settings.savingsOpeningUsd) || 0;
    data.settings.savingsEntries = existing > 0 ? [{
      id: 'manual-saving-opening-' + Date.now(),
      type: 'deposit',
      amount: existing,
      note: 'الرصيد الحالي',
      date: new Date().toLocaleDateString('en-CA')
    }] : [];
    data.settings.savingsLedgerInitialized = true;
    syncManualSavingsTotal();
    return true;
  }

  function renderManualSavings(){
    ensureManualSavingsLedger();
    const total = syncManualSavingsTotal();
    document.querySelector('#savingsBalance').textContent = '$' + fmtUsd(total);
    const history = document.querySelector('#manualSavingsHistory');
    const entries = [...manualSavingsEntries()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
    history.innerHTML = entries.map(item=>{
      const withdrawal = item.type==='withdraw';
      const label = withdrawal ? 'سحب من الصندوق' : 'إيداع في الصندوق';
      return `<div class="saving-row"><div><b>${label}: ${esc(item.note||'—')}</b><small>${esc(item.date||'—')}</small></div><div class="saving-side"><b class="${withdrawal?'red':'green'}">${withdrawal?'-':'+'}$${fmtUsd(item.amount)}</b><div class="saving-actions"><button type="button" class="edit" data-manual-action="edit" data-id="${esc(item.id)}">تعديل</button><button type="button" class="del" data-manual-action="delete" data-id="${esc(item.id)}">حذف</button></div></div></div>`;
    }).join('') || '<div class="empty">لا توجد عمليات في صندوق الادخار.</div>';
  }

  function updateManualSavingsMode(){
    const withdrawal = document.querySelector('#manualSavingsType').value==='withdraw';
    document.querySelector('#manualSavingsNoteLabel').textContent = withdrawal ? 'سبب السحب' : 'مصدر المبلغ';
    document.querySelector('#manualSavingsNote').placeholder = withdrawal ? 'مثال: شراء جهاز أو حالة طارئة' : 'مثال: من راتب شهر 10';
    document.querySelector('#manualSavingsSubmit').textContent = editingManualSavingId ? 'حفظ التعديل' : withdrawal ? '− سحب من الصندوق' : '+ إيداع في الصندوق';
    document.querySelector('#manualSavingsMessage').textContent = '';
  }

  function resetManualSavingsForm(){
    editingManualSavingId = null;
    document.querySelector('#manualSavingsForm').reset();
    document.querySelector('#manualSavingsDate').value = new Date().toLocaleDateString('en-CA');
    document.querySelector('#manualSavingsCancel').style.display = 'none';
    document.querySelector('#manualSavingsMessage').textContent = '';
    updateManualSavingsMode();
  }

  const originalRender = render;
  render = function(){
    originalRender();
    const changed = ensureManualSavingsLedger();
    renderManualSavings();
    if(changed && session && accountReady && !migrationSaveQueued){
      migrationSaveQueued = true;
      setTimeout(()=>{ migrationSaveQueued = false; save(); },0);
    }
  };

  const manualForm = document.querySelector('#manualSavingsForm');
  manualForm.addEventListener('submit', event => {
    event.preventDefault();
    const type = document.querySelector('#manualSavingsType').value==='withdraw'?'withdraw':'deposit';
    const amount = Number(document.querySelector('#manualSavingsAmount').value);
    const note = document.querySelector('#manualSavingsNote').value.trim();
    const date = document.querySelector('#manualSavingsDate').value;
    const message = document.querySelector('#manualSavingsMessage');
    if(!(amount > 0)){ message.textContent = 'أدخل مبلغاً أكبر من صفر.'; return; }
    if(!note){ message.textContent = type==='withdraw'?'اكتب سبب السحب.':'اكتب مصدر المبلغ.'; return; }
    if(!date){ message.textContent = 'اختر تاريخ العملية.'; return; }
    const nextTotal = manualSavingsTotal(editingManualSavingId) + (type==='withdraw'?-amount:amount);
    if(nextTotal < -0.001){ message.textContent = 'مبلغ السحب أكبر من رصيد صندوق الادخار.'; return; }
    const item = {id:editingManualSavingId||('manual-saving-'+Date.now()),type,amount,note,date};
    if(editingManualSavingId) data.settings.savingsEntries = manualSavingsEntries().map(x=>String(x.id)===String(editingManualSavingId)?item:x);
    else data.settings.savingsEntries = [...manualSavingsEntries(),item];
    data.settings.savingsLedgerInitialized = true;
    syncManualSavingsTotal();
    const edited = !!editingManualSavingId;
    resetManualSavingsForm();
    save();
    document.querySelector('#manualSavingsMessage').textContent = edited ? 'تم حفظ تعديل العملية.' : type==='withdraw' ? 'تم تسجيل السحب من صندوق الادخار.' : 'تم تسجيل الإيداع في صندوق الادخار.';
  });

  document.querySelector('#manualSavingsType').addEventListener('change',updateManualSavingsMode);
  document.querySelector('#manualSavingsCancel').addEventListener('click',resetManualSavingsForm);
  document.querySelector('#manualSavingsHistory').addEventListener('click',event=>{
    const button = event.target.closest('button[data-manual-action]');
    if(!button) return;
    const item = manualSavingsEntries().find(x=>String(x.id)===String(button.dataset.id));
    if(!item) return;
    if(button.dataset.manualAction === 'edit'){
      editingManualSavingId = item.id;
      document.querySelector('#manualSavingsType').value = item.type==='withdraw'?'withdraw':'deposit';
      document.querySelector('#manualSavingsAmount').value = item.amount;
      document.querySelector('#manualSavingsNote').value = item.note || '';
      document.querySelector('#manualSavingsDate').value = item.date || new Date().toLocaleDateString('en-CA');
      document.querySelector('#manualSavingsCancel').style.display = 'block';
      updateManualSavingsMode();
      document.querySelector('#manualSavingsForm').scrollIntoView({behavior:'smooth'});
      return;
    }
    if(button.dataset.manualAction === 'delete'){
      if(manualSavingsTotal(item.id) < -0.001){
        document.querySelector('#manualSavingsMessage').textContent = 'لا يمكن حذف هذا الإيداع لأن الرصيد سيصبح سالباً. احذف أو عدّل السحب المرتبط به أولاً.';
        return;
      }
      armDelete(button,()=>{
        data.settings.savingsEntries = manualSavingsEntries().filter(x=>String(x.id)!==String(item.id));
        syncManualSavingsTotal();
        if(String(editingManualSavingId)===String(item.id)) resetManualSavingsForm();
        save();
      });
    }
  });

  const resetButton = document.querySelector('#resetFreshData');
  let resetArmed = false;
  let resetTimer = null;
  resetButton.addEventListener('click', () => {
    const status = document.querySelector('#sheetImportStatus');
    if(!Array.isArray(window.FRESH_SHEET_HISTORY)){
      status.textContent = 'تعذر تحميل بيانات الشيت. حدّث الصفحة وحاول مجدداً.';
      return;
    }
    if(!resetArmed){
      resetArmed = true;
      resetButton.textContent = 'تأكيد الاستبدال الآن';
      resetButton.classList.add('danger');
      status.textContent = 'اضغط مرة ثانية خلال 10 ثوانٍ لحذف الحركات الحالية واستبدالها بحركات الشيت حتى 24/10.';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        resetArmed = false;
        resetButton.textContent = 'إعادة بناء الحركات من الشيت';
        resetButton.classList.remove('danger');
        status.textContent = '';
      }, 10000);
      return;
    }
    clearTimeout(resetTimer);
    data.movements = structuredClone(window.FRESH_SHEET_HISTORY);
    data.settings.savingsOpeningUsd = 0;
    data.settings.manualSavingsUsd = 0;
    data.settings.savingsEntries = [];
    data.settings.savingsLedgerInitialized = true;
    data.settings.emergencyFundUsd = 0;
    data.settings.emergencyEntries = [];
    data.settings.emergencyLedgerInitialized = true;
    data.meta = {
      ...(data.meta || {}),
      version: APP_VERSION,
      freshSheetImportedAt: new Date().toISOString(),
      freshSheetThrough: window.FRESH_SHEET_META?.through || '2026-10-24',
      freshSheetMovementCount: data.movements.length
    };
    resetMovementForm();
    resetSavingsForm();
    save();
    resetArmed = false;
    resetButton.textContent = 'إعادة بناء الحركات من الشيت';
    resetButton.classList.remove('danger');
    status.textContent = `تم استبدال الحركات بـ ${data.movements.length} حركة من الشيت حتى 24/10. صندوقا الطوارئ والادخار أصبحا $0 والذمم بقيت كما هي.`;
  });

  resetManualSavingsForm();
  render();
})();

(function(){
  let editingEmergencyId = null;
  let emergencyMigrationSaveQueued = false;

  function emergencyEntries(){
    if(!Array.isArray(data.settings.emergencyEntries)) data.settings.emergencyEntries = [];
    data.settings.emergencyEntries = data.settings.emergencyEntries.map(item=>({...item,type:item.type==='withdraw'?'withdraw':'deposit'}));
    return data.settings.emergencyEntries;
  }

  function emergencySignedAmount(item){
    const amount = Number(item.amount)||0;
    return item.type==='withdraw' ? -amount : amount;
  }

  function emergencyTotal(excludeId=null){
    return emergencyEntries().filter(item=>String(item.id)!==String(excludeId)).reduce((sum,item)=>sum+emergencySignedAmount(item),0);
  }

  function syncEmergencyTotal(){
    const total = emergencyTotal();
    data.settings.emergencyFundUsd = total;
    return total;
  }

  function emergencyMovement(item){
    const deposit=item.type!=='withdraw';
    return {
      id:item.movementId,
      kind:deposit?'expense':'income',
      amount:Number(item.amount)||0,
      currency:'USD',
      category:'صندوق الطوارئ',
      desc:`${deposit?'نقل إلى صندوق الطوارئ':'استرجاع من صندوق الطوارئ'}: ${item.note||'—'}`,
      date:item.date,
      source:'app',
      emergencyTransfer:true,
      emergencyEntryId:item.id
    };
  }

  function upsertEmergencyMovement(item){
    const movement=emergencyMovement(item),index=data.movements.findIndex(x=>String(x.id)===String(item.movementId)||String(x.emergencyEntryId)===String(item.id));
    if(index>=0)data.movements[index]={...data.movements[index],...movement};
    else data.movements.push(movement);
  }

  function ensureEmergencyLedger(){
    let changed=false;
    if(!data.settings.emergencyLedgerInitialized){
      const existing = Number(data.settings.emergencyFundUsd)||0;
      data.settings.emergencyEntries = existing > 0 ? [{
        id: 'emergency-opening-' + Date.now(),
        type: 'deposit',
        amount: existing,
        note: 'الرصيد الحالي',
        date: new Date().toLocaleDateString('en-CA')
      }] : [];
      data.settings.emergencyLedgerInitialized = true;
      changed=true;
    }
    data.settings.emergencyEntries=emergencyEntries().map(item=>{
      if(item.movementId)return item;
      const linked={...item,movementId:'emergency-transfer-'+item.id};
      upsertEmergencyMovement(linked);
      changed=true;
      return linked;
    });
    syncEmergencyTotal();
    return changed;
  }

  function renderEmergencyFund(){
    ensureEmergencyLedger();
    const total = syncEmergencyTotal();
    document.querySelector('#emergencyBalance').textContent = '$' + fmtUsd(total);
    const entries = [...emergencyEntries()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
    document.querySelector('#emergencyHistory').innerHTML = entries.map(item=>{
      const withdrawal = item.type==='withdraw';
      return `<div class="saving-row"><div><b>${withdrawal?'استرجاع إلى الرصيد':'نقل إلى الطوارئ'}: ${esc(item.note||'—')}</b><small>${esc(item.date||'—')}</small></div><div class="saving-side"><b class="${withdrawal?'gold':'green'}">${withdrawal?'-':'+'}$${fmtUsd(item.amount)}</b><div class="saving-actions"><button type="button" class="edit" data-emergency-action="edit" data-id="${esc(item.id)}">تعديل</button><button type="button" class="del" data-emergency-action="delete" data-id="${esc(item.id)}">حذف</button></div></div></div>`;
    }).join('') || '<div class="empty">لا توجد عمليات في صندوق الطوارئ.</div>';
  }

  function updateEmergencyMode(){
    const withdrawal = document.querySelector('#emergencyType').value==='withdraw';
    document.querySelector('#emergencyNoteLabel').textContent = withdrawal ? 'سبب الاسترجاع' : 'مصدر المبلغ';
    document.querySelector('#emergencyNote').placeholder = withdrawal ? 'مثال: احتجت 50$ للمصروف' : 'مثال: محجوز من راتب شهر 11';
    document.querySelector('#emergencySubmit').textContent = editingEmergencyId ? 'حفظ التعديل' : withdrawal ? 'استرجاع إلى الرصيد المتاح' : 'نقل إلى صندوق الطوارئ';
    document.querySelector('#emergencyMessage').textContent = '';
  }

  function resetEmergencyForm(){
    editingEmergencyId = null;
    document.querySelector('#emergencyForm').reset();
    document.querySelector('#emergencyDate').value = new Date().toLocaleDateString('en-CA');
    document.querySelector('#emergencyCancel').style.display = 'none';
    document.querySelector('#emergencyMessage').textContent = '';
    updateEmergencyMode();
  }

  const previousRender = render;
  render = function(){
    previousRender();
    const changed = ensureEmergencyLedger();
    renderEmergencyFund();
    if(changed && session && accountReady && !emergencyMigrationSaveQueued){
      emergencyMigrationSaveQueued = true;
      setTimeout(()=>{ emergencyMigrationSaveQueued = false; save(); },0);
    }
  };

  document.querySelector('#emergencyForm').addEventListener('submit',event=>{
    event.preventDefault();
    const type = document.querySelector('#emergencyType').value==='withdraw'?'withdraw':'deposit';
    const amount = Number(document.querySelector('#emergencyAmount').value);
    const note = document.querySelector('#emergencyNote').value.trim();
    const date = document.querySelector('#emergencyDate').value;
    const message = document.querySelector('#emergencyMessage');
    if(!(amount>0)){ message.textContent='أدخل مبلغاً أكبر من صفر.'; return; }
    if(!note){ message.textContent=type==='withdraw'?'اكتب سبب السحب.':'اكتب مصدر المبلغ.'; return; }
    if(!date){ message.textContent='اختر تاريخ العملية.'; return; }
    const nextTotal = emergencyTotal(editingEmergencyId) + (type==='withdraw'?-amount:amount);
    if(nextTotal < -0.001){ message.textContent='مبلغ السحب أكبر من رصيد صندوق الطوارئ.'; return; }
    const old=editingEmergencyId?emergencyEntries().find(x=>String(x.id)===String(editingEmergencyId)):null,id=old?.id||('emergency-'+Date.now()),movementId=old?.movementId||('emergency-transfer-'+id),item={id,movementId,type,amount,note,date};
    if(editingEmergencyId) data.settings.emergencyEntries=emergencyEntries().map(x=>String(x.id)===String(editingEmergencyId)?item:x);
    else data.settings.emergencyEntries=[...emergencyEntries(),item];
    upsertEmergencyMovement(item);
    data.settings.emergencyLedgerInitialized=true;
    syncEmergencyTotal();
    const edited=!!editingEmergencyId;
    resetEmergencyForm();
    save();
    document.querySelector('#emergencyMessage').textContent=edited?'تم حفظ تعديل العملية وتحديث الرصيد.':type==='withdraw'?'تم استرجاع المبلغ إلى الرصيد المتاح.':'تم نقل المبلغ إلى صندوق الطوارئ.';
  });

  document.querySelector('#emergencyType').addEventListener('change',updateEmergencyMode);
  document.querySelector('#emergencyCancel').addEventListener('click',resetEmergencyForm);
  document.querySelector('#emergencyHistory').addEventListener('click',event=>{
    const button=event.target.closest('button[data-emergency-action]');
    if(!button)return;
    const item=emergencyEntries().find(x=>String(x.id)===String(button.dataset.id));
    if(!item)return;
    if(button.dataset.emergencyAction==='edit'){
      editingEmergencyId=item.id;
      document.querySelector('#emergencyType').value=item.type==='withdraw'?'withdraw':'deposit';
      document.querySelector('#emergencyAmount').value=item.amount;
      document.querySelector('#emergencyNote').value=item.note||'';
      document.querySelector('#emergencyDate').value=item.date||new Date().toLocaleDateString('en-CA');
      document.querySelector('#emergencyCancel').style.display='block';
      updateEmergencyMode();
      document.querySelector('#emergencyForm').scrollIntoView({behavior:'smooth'});
      return;
    }
    if(button.dataset.emergencyAction==='delete'){
      if(emergencyTotal(item.id)<-0.001){
        document.querySelector('#emergencyMessage').textContent='لا يمكن حذف هذا الإيداع لأن رصيد الطوارئ سيصبح سالباً. احذف أو عدّل السحب المرتبط به أولاً.';
        return;
      }
      armDelete(button,()=>{
        data.settings.emergencyEntries=emergencyEntries().filter(x=>String(x.id)!==String(item.id));
        data.movements=data.movements.filter(x=>String(x.id)!==String(item.movementId)&&String(x.emergencyEntryId)!==String(item.id));
        syncEmergencyTotal();
        if(String(editingEmergencyId)===String(item.id))resetEmergencyForm();
        save();
      });
    }
  });

  resetEmergencyForm();
  render();
})();
