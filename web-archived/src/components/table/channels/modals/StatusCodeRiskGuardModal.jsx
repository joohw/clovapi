import React, { useMemo } from 'react';
import RiskAcknowledgementModal from '../../../common/modals/RiskAcknowledgementModal';
import {
  STATUS_CODE_RISK_TEXTS,
  STATUS_CODE_RISK_CHECKLIST,
} from './statusCodeRiskGuard';

const StatusCodeRiskGuardModal = React.memo(function StatusCodeRiskGuardModal({
  visible,
  detailItems,
  onCancel,
  onConfirm,
}) {
  const checklist = useMemo(
    () => STATUS_CODE_RISK_CHECKLIST.map((item) => item),
    [],
  );

  return (
    <RiskAcknowledgementModal
      visible={visible}
      title={STATUS_CODE_RISK_TEXTS.title}
      markdownContent={STATUS_CODE_RISK_TEXTS.markdown}
      detailTitle={STATUS_CODE_RISK_TEXTS.detailTitle}
      detailItems={detailItems}
      checklist={checklist}
      inputPrompt={STATUS_CODE_RISK_TEXTS.inputPrompt}
      requiredText={STATUS_CODE_RISK_TEXTS.confirmText}
      inputPlaceholder={STATUS_CODE_RISK_TEXTS.inputPlaceholder}
      mismatchText={STATUS_CODE_RISK_TEXTS.mismatchText}
      cancelText={"取消"}
      confirmText={STATUS_CODE_RISK_TEXTS.confirmButton}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
});

export default StatusCodeRiskGuardModal;
