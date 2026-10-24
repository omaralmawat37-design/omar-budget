(function(){
  let editingManualSavingId = null;
  let migrationSaveQueued = false;

  function manualSavingsEntries(){
    if(!Array.isArray(data.settings.savingsEntries)) data.settings.savingsEntries = [];
    return data.settings.savingsEntries;
  }

  function manualSavingsTotal(){
    return manualSavingsEntries().reduce((sum,item)=>sum+(Number(item.amount)||0),0);
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
    history.innerHTML = entries.map(item=>`<div class="saving-row"><div><b>${esc(item.note||'عملية ادخار')}</b><small>${esc(item.date||'—')}</small></div><div class="saving-side"><b class="gold">+$${fmtUsd(item.amount)}</b><div class="saving-actions"><button type="button" class="edit" data-manual-action="edit" data-id="${esc(item.id)}">تعديل</button><button type="button" class="del" data-manual-action="delete" data-id="${esc(item.id)}">حذف</button></div></div></div>`).join('') || '<div class="empty">لا توجد عمليات في صندوق الادخار.</div>';
  }

  function resetManualSavingsForm(){
    editingManualSavingId = null;
    document.querySelector('#manualSavingsForm').reset();
    document.querySelector('#manualSavingsDate').value = new Date().toLocaleDateString('en-CA');
    document.querySelector('#manualSavingsSubmit').textContent = '+ إضافة إلى الصندوق';
    document.querySelector('#manualSavingsCancel').style.display = 'none';
    document.querySelector('#manualSavingsMessage').textContent = '';
  }

  const originalRender = render;
  render = function(){
    originalRender();
    const changed = ensureManualSavingsLedger();
    renderManualSavings();
    if(changed && session && !migrationSaveQueued){
      migrationSaveQueued = true;
      setTimeout(()=>{ migrationSaveQueued = false; save(); },0);
    }
  };

  const manualForm = document.querySelector('#manualSavingsForm');
  manualForm.addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number(document.querySelector('#manualSavingsAmount').value);
    const note = document.querySelector('#manualSavingsNote').value.trim();
    const date = document.querySelector('#manualSavingsDate').value;
    const message = document.querySelector('#manualSavingsMessage');
    if(!(amount > 0)){ message.textContent = 'أدخل مبلغاً أكبر من صفر.'; return; }
    if(!note){ message.textContent = 'اكتب مصدر المبلغ أو ملاحظة قصيرة.'; return; }
    if(!date){ message.textContent = 'اختر تاريخ العملية.'; return; }
    const item = {id:editingManualSavingId||('manual-saving-'+Date.now()),amount,note,date};
    if(editingManualSavingId) data.settings.savingsEntries = manualSavingsEntries().map(x=>String(x.id)===String(editingManualSavingId)?item:x);
    else data.settings.savingsEntries = [...manualSavingsEntries(),item];
    data.settings.savingsLedgerInitialized = true;
    syncManualSavingsTotal();
    const edited = !!editingManualSavingId;
    resetManualSavingsForm();
    save();
    document.querySelector('#manualSavingsMessage').textContent = edited ? 'تم حفظ تعديل العملية.' : 'تمت إضافة العملية إلى صندوق الادخار.';
  });

  document.querySelector('#manualSavingsCancel').addEventListener('click',resetManualSavingsForm);
  document.querySelector('#manualSavingsHistory').addEventListener('click',event=>{
    const button = event.target.closest('button[data-manual-action]');
    if(!button) return;
    const item = manualSavingsEntries().find(x=>String(x.id)===String(button.dataset.id));
    if(!item) return;
    if(button.dataset.manualAction === 'edit'){
      editingManualSavingId = item.id;
      document.querySelector('#manualSavingsAmount').value = item.amount;
      document.querySelector('#manualSavingsNote').value = item.note || '';
      document.querySelector('#manualSavingsDate').value = item.date || new Date().toLocaleDateString('en-CA');
      document.querySelector('#manualSavingsSubmit').textContent = 'حفظ التعديل';
      document.querySelector('#manualSavingsCancel').style.display = 'block';
      document.querySelector('#manualSavingsMessage').textContent = '';
      document.querySelector('#manualSavingsForm').scrollIntoView({behavior:'smooth'});
      return;
    }
    if(button.dataset.manualAction === 'delete'){
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
    data.meta = {
      ...(data.meta || {}),
      version: 25,
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
    status.textContent = `تم استبدال الحركات بـ ${data.movements.length} حركة من الشيت حتى 24/10. صندوق الادخار أصبح $0 والذمم بقيت كما هي.`;
  });

  resetManualSavingsForm();
  render();
})();

