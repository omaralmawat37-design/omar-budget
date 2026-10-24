(function(){
  const originalRender = render;
  render = function(){
    originalRender();
    const input = document.querySelector('#manualSavingsAmount');
    if(input && document.activeElement !== input) input.value = Number(data.settings.savingsOpeningUsd || 0);
  };

  const manualForm = document.querySelector('#manualSavingsForm');
  manualForm.addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number(document.querySelector('#manualSavingsAmount').value);
    const message = document.querySelector('#manualSavingsMessage');
    if(!Number.isFinite(amount) || amount < 0){
      message.textContent = 'أدخل مبلغاً صحيحاً (صفر أو أكثر).';
      return;
    }
    data.settings.savingsOpeningUsd = amount;
    data.settings.manualSavingsUsd = amount;
    message.textContent = 'تم حفظ صندوق الادخار بشكل مستقل.';
    save();
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

  render();
})();
