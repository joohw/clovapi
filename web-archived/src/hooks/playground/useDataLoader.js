import { useCallback, useEffect } from 'react';
import {
  API,
  processModelsData,
  processGroupsData,
  showError,
} from '../../helpers';
import { API_ENDPOINTS } from '../../constants/playground.constants';

export const useDataLoader = (
  userState,
  inputs,
  handleInputChange,
  setModels,
  setGroups,
) => {
  const loadModels = useCallback(async () => {
    try {
      const res = await API.get(API_ENDPOINTS.USER_MODELS);
      const { success, message, data } = res.data;

      if (success) {
        const { modelOptions, selectedModel } = processModelsData(
          data,
          inputs.model,
        );
        setModels(modelOptions);

        if (selectedModel !== inputs.model) {
          handleInputChange('model', selectedModel);
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError("加载模型失败");
    }
  }, [inputs.model, handleInputChange, setModels]);

  const loadGroups = useCallback(async () => {
    try {
      const res = await API.get(API_ENDPOINTS.USER_GROUPS);
      const { success, message, data } = res.data;

      if (success) {
        const userGroup =
          userState?.user?.group ||
          JSON.parse(localStorage.getItem('user'))?.group;
        const groupOptions = processGroupsData(data, userGroup);
        setGroups(groupOptions);

        const hasCurrentGroup = groupOptions.some(
          (option) => option.value === inputs.group,
        );
        if (!hasCurrentGroup) {
          handleInputChange('group', groupOptions[0]?.value || '');
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError("加载分组失败");
    }
  }, [userState, inputs.group, handleInputChange, setGroups]);

  // 自动加载数据
  useEffect(() => {
    if (userState?.user) {
      loadModels();
      loadGroups();
    }
  }, [userState?.user, loadModels, loadGroups]);

  return {
    loadModels,
    loadGroups,
  };
};
