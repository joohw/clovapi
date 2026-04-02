import React from 'react';
import SelectableButtonGroup from '../../../common/ui/SelectableButtonGroup';

const PricingDisplaySettings = ({
  showRatio,
  setShowRatio,
  loading = false,
  t,
}) => {
  const items = [
    {
      value: 'ratio',
      label: t('显示倍率'),
    },
  ];

  const handleChange = (value) => {
    switch (value) {
      case 'ratio':
        setShowRatio(!showRatio);
        break;
    }
  };

  const getActiveValues = () => {
    const activeValues = [];
    if (showRatio) activeValues.push('ratio');
    return activeValues;
  };

  return (
    <div>
      <SelectableButtonGroup
        title={t('显示设置')}
        items={items}
        activeValue={getActiveValues()}
        onChange={handleChange}
        withCheckbox
        collapsible={false}
        loading={loading}
        t={t}
      />
    </div>
  );
};

export default PricingDisplaySettings;
