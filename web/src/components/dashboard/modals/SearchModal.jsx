import React, { useRef } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';

const SearchModal = ({
  searchModalVisible,
  handleSearchConfirm,
  handleCloseModal,
  isMobile,
  isAdminUser,
  inputs,
  dataExportDefaultTime,
  timeOptions,
  handleInputChange,
}) => {
  const formRef = useRef();

  const FORM_FIELD_PROPS = {
    className: 'w-full mb-2 !rounded-lg',
  };

  const createFormField = (Component, props) => (
    <Component {...FORM_FIELD_PROPS} {...props} />
  );

  const { start_timestamp, end_timestamp, username } = inputs;

  return (
    <Modal
      title={"搜索条件"}
      visible={searchModalVisible}
      onOk={handleSearchConfirm}
      onCancel={handleCloseModal}
      closeOnEsc={true}
      size={isMobile ? 'full-width' : 'small'}
      centered
    >
      <Form ref={formRef} layout='vertical' className='w-full'>
        {createFormField(Form.DatePicker, {
          field: 'start_timestamp',
          label: "起始时间",
          initValue: start_timestamp,
          value: start_timestamp,
          type: 'dateTime',
          name: 'start_timestamp',
          onChange: (value) => handleInputChange(value, 'start_timestamp'),
        })}

        {createFormField(Form.DatePicker, {
          field: 'end_timestamp',
          label: "结束时间",
          initValue: end_timestamp,
          value: end_timestamp,
          type: 'dateTime',
          name: 'end_timestamp',
          onChange: (value) => handleInputChange(value, 'end_timestamp'),
        })}

        {createFormField(Form.Select, {
          field: 'data_export_default_time',
          label: "时间粒度",
          initValue: dataExportDefaultTime,
          placeholder: "时间粒度",
          name: 'data_export_default_time',
          optionList: timeOptions,
          onChange: (value) =>
            handleInputChange(value, 'data_export_default_time'),
        })}

        {isAdminUser &&
          createFormField(Form.Input, {
            field: 'username',
            label: "用户名称",
            value: username,
            placeholder: "可选值",
            name: 'username',
            onChange: (value) => handleInputChange(value, 'username'),
          })}
      </Form>
    </Modal>
  );
};

export default SearchModal;
