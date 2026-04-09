import React, { useEffect, useState } from 'react';
import { API, showError } from '../../../helpers';
import ModelPricingEditor from './components/ModelPricingEditor';

export default function ModelRatioNotSetEditor(props) {
  const [enabledModels, setEnabledModels] = useState([]);
  const [enabledModelDetails, setEnabledModelDetails] = useState([]);

  const getAllEnabledModels = async () => {
    try {
      const res = await API.get('/api/channel/models_enabled');
      const { success, message, data, details } = res.data;
      if (success) {
        setEnabledModels(Array.isArray(data) ? data : []);
        setEnabledModelDetails(Array.isArray(details) ? details : []);
      } else {
        showError(message);
      }
    } catch (error) {
      console.error("获取启用模型失败:", error);
      showError("获取启用模型失败");
    }
  };

  useEffect(() => {
    // 获取所有启用的模型
    getAllEnabledModels();
  }, []);
  return (
    <ModelPricingEditor
      options={props.options}
      refresh={props.refresh}
      candidateModelNames={enabledModels}
      candidateModelDetails={enabledModelDetails}
      filterMode='unset'
      allowAddModel={false}
      allowDeleteModel={false}
      showConflictFilter={false}
      listDescription={"此页面仅显示未设置价格或基础倍率的模型，设置后会自动从列表中移出"}
      emptyTitle={"没有未设置定价的模型"}
      emptyDescription={"当前没有未设置定价的模型"}
    />
  );
}
