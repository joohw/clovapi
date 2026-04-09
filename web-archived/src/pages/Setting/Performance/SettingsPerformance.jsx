import React, { useEffect, useState, useRef } from 'react';
import {
  Banner,
  Button,
  Col,
  Form,
  InputNumber,
  Row,
  Spin,
  Progress,
  Descriptions,
  Tag,
  Popconfirm,
  RadioGroup,
  Radio,
  Typography,
} from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';
const { Text } = Typography;

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 Bytes';
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return '-' + formatBytes(-bytes, decimals);
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0 || i >= sizes.length) return bytes + ' Bytes';
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function SettingsPerformance(props) {
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [inputs, setInputs] = useState({
    'performance_setting.disk_cache_enabled': false,
    'performance_setting.disk_cache_threshold_mb': 10,
    'performance_setting.disk_cache_max_size_mb': 1024,
    'performance_setting.disk_cache_path': '',
    'performance_setting.monitor_enabled': false,
    'performance_setting.monitor_cpu_threshold': 90,
    'performance_setting.monitor_memory_threshold': 90,
    'performance_setting.monitor_disk_threshold': 95,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const [logInfo, setLogInfo] = useState(null);
  const [logCleanupMode, setLogCleanupMode] = useState('by_count');
  const [logCleanupValue, setLogCleanupValue] = useState(10);
  const [logCleanupLoading, setLogCleanupLoading] = useState(false);

  function handleFieldChange(fieldName) {
    return (value) => {
      setInputs((inputs) => ({ ...inputs, [fieldName]: value }));
    };
  }

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning("你似乎并没有修改什么");
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = String(inputs[item.key]);
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError("部分保存失败，请重试");
        }
        showSuccess("保存成功");
        props.refresh();
        fetchStats();
      })
      .catch(() => {
        showError("保存失败，请重试");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const res = await API.get('/api/performance/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch performance stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }

  async function clearDiskCache() {
    try {
      const res = await API.delete('/api/performance/disk_cache');
      if (res.data.success) {
        showSuccess("磁盘缓存已清理");
        fetchStats();
      } else {
        showError(res.data.message || "清理失败");
      }
    } catch (error) {
      showError("清理失败");
    }
  }

  async function resetStats() {
    try {
      const res = await API.post('/api/performance/reset_stats');
      if (res.data.success) {
        showSuccess("统计已重置");
        fetchStats();
      }
    } catch (error) {
      showError("重置失败");
    }
  }

  async function forceGC() {
    try {
      const res = await API.post('/api/performance/gc');
      if (res.data.success) {
        showSuccess("GC 已执行");
        fetchStats();
      }
    } catch (error) {
      showError("GC 执行失败");
    }
  }

  async function fetchLogInfo() {
    try {
      const res = await API.get('/api/performance/logs');
      if (res.data.success) {
        setLogInfo(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch log info:', error);
    }
  }

  async function cleanupLogFiles() {
    if (logCleanupValue == null || isNaN(logCleanupValue) || logCleanupValue < 1) {
      showError("请输入有效的数值");
      return;
    }
    setLogCleanupLoading(true);
    try {
      const res = await API.delete(
        `/api/performance/logs?mode=${logCleanupMode}&value=${logCleanupValue}`,
      );
      if (res.data.success) {
        const { deleted_count, freed_bytes } = res.data.data;
        showSuccess(
          `已清理 ${deleted_count} 个日志文件，释放 ${formatBytes(freed_bytes)}`,
        );
      } else {
        showError(res.data.message || "清理失败");
      }
      fetchLogInfo();
    } catch (error) {
      showError("清理失败");
    } finally {
      setLogCleanupLoading(false);
    }
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        if (typeof inputs[key] === 'boolean') {
          currentInputs[key] =
            props.options[key] === 'true' || props.options[key] === true;
        } else if (typeof inputs[key] === 'number') {
          currentInputs[key] = parseInt(props.options[key]) || inputs[key];
        } else {
          currentInputs[key] = props.options[key];
        }
      }
    }
    setInputs({ ...inputs, ...currentInputs });
    setInputsRow({ ...inputs, ...currentInputs });
    if (refForm.current) {
      refForm.current.setValues({ ...inputs, ...currentInputs });
    }
    fetchStats();
    fetchLogInfo();
  }, [props.options]);

  const diskCacheUsagePercent =
    stats?.cache_stats?.disk_cache_max_bytes > 0
      ? (
          (stats.cache_stats.current_disk_usage_bytes /
            stats.cache_stats.disk_cache_max_bytes) *
          100
        ).toFixed(1)
      : 0;

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={"磁盘缓存设置（磁盘换内存）"}>
            <Banner
              type='info'
              description={"启用磁盘缓存后，大请求体将临时存储到磁盘而非内存，可显著降低内存占用，适用于处理包含大量图片/文件的请求。建议在 SSD 环境下使用。"}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'performance_setting.disk_cache_enabled'}
                  label={"启用磁盘缓存"}
                  extraText={"将大请求体临时存储到磁盘"}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={handleFieldChange(
                    'performance_setting.disk_cache_enabled',
                  )}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'performance_setting.disk_cache_threshold_mb'}
                  label={"磁盘缓存阈值 (MB)"}
                  extraText={"请求体超过此大小时使用磁盘缓存"}
                  min={1}
                  max={1024}
                  onChange={handleFieldChange(
                    'performance_setting.disk_cache_threshold_mb',
                  )}
                  disabled={!inputs['performance_setting.disk_cache_enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'performance_setting.disk_cache_max_size_mb'}
                  label={"磁盘缓存最大总量 (MB)"}
                  extraText={
                    stats?.disk_space_info?.total > 0
                      ? `可用空间: ${formatBytes(stats.disk_space_info.free)} / 总空间: ${formatBytes(stats.disk_space_info.total)}`
                      : "磁盘缓存占用的最大空间"
                  }
                  min={100}
                  max={102400}
                  onChange={handleFieldChange(
                    'performance_setting.disk_cache_max_size_mb',
                  )}
                  disabled={!inputs['performance_setting.disk_cache_enabled']}
                />
              </Col>
              {/* 只在非容器环境显示缓存目录配置 */}
              {!stats?.config?.is_running_in_container && (
                <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                  <Form.Input
                    field={'performance_setting.disk_cache_path'}
                    label={"缓存目录"}
                    extraText={"留空使用系统临时目录"}
                    placeholder={"例如 /var/cache/new-api"}
                    onChange={handleFieldChange(
                      'performance_setting.disk_cache_path',
                    )}
                    showClear
                    disabled={!inputs['performance_setting.disk_cache_enabled']}
                  />
                </Col>
              )}
            </Row>
          </Form.Section>

          <Form.Section text={"系统性能监控"}>
            <Banner
              type='info'
              description={"启用性能监控后，当系统资源使用率超过设定阈值时，将拒绝新的 Relay 请求 (/v1, /v1beta 等)，以保护系统稳定性。"}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16}>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.Switch
                  field={'performance_setting.monitor_enabled'}
                  label={"启用性能监控"}
                  extraText={"超过阈值时拒绝新请求"}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={handleFieldChange(
                    'performance_setting.monitor_enabled',
                  )}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'performance_setting.monitor_cpu_threshold'}
                  label={"CPU 阈值 (%)"}
                  extraText={"CPU 使用率超过此值时拒绝请求"}
                  min={0}
                  max={100}
                  onChange={handleFieldChange(
                    'performance_setting.monitor_cpu_threshold',
                  )}
                  disabled={!inputs['performance_setting.monitor_enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'performance_setting.monitor_memory_threshold'}
                  label={"内存 阈值 (%)"}
                  extraText={"内存使用率超过此值时拒绝请求"}
                  min={0}
                  max={100}
                  onChange={handleFieldChange(
                    'performance_setting.monitor_memory_threshold',
                  )}
                  disabled={!inputs['performance_setting.monitor_enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.InputNumber
                  field={'performance_setting.monitor_disk_threshold'}
                  label={"磁盘 阈值 (%)"}
                  extraText={"磁盘使用率超过此值时拒绝请求"}
                  min={0}
                  max={100}
                  onChange={handleFieldChange(
                    'performance_setting.monitor_disk_threshold',
                  )}
                  disabled={!inputs['performance_setting.monitor_enabled']}
                />
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {"保存性能设置"}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>

      {/* 服务器日志管理 */}
      <Form.Section text={"服务器日志管理"}>
        <Banner
          type='info'
          description={"管理服务器运行日志文件。日志文件会随运行时间不断累积，建议定期清理以释放磁盘空间。"}
          style={{ marginBottom: 16 }}
        />
        {logInfo === null ? null : logInfo.enabled ? (
          <>
            <Descriptions
              data={[
                { key: "日志目录", value: logInfo.log_dir },
                {
                  key: "日志文件数",
                  value: logInfo.file_count,
                },
                {
                  key: "日志总大小",
                  value: formatBytes(logInfo.total_size),
                },
                ...(logInfo.oldest_time && logInfo.newest_time
                  ? [
                      {
                        key: "日志时间范围",
                        value: `${new Date(logInfo.oldest_time).toLocaleDateString()} ~ ${new Date(logInfo.newest_time).toLocaleDateString()}`,
                      },
                    ]
                  : []),
              ]}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {"清理方式"}
                  </Text>
                  <RadioGroup
                    value={logCleanupMode}
                    onChange={(e) => setLogCleanupMode(e.target.value)}
                  >
                    <Radio value='by_count'>{"保留最近N个文件"}</Radio>
                    <Radio value='by_days'>{"保留最近N天"}</Radio>
                  </RadioGroup>
                </div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {logCleanupMode === 'by_count'
                      ? "保留文件数"
                      : "保留天数"}
                  </Text>
                  <InputNumber
                    value={logCleanupValue}
                    min={1}
                    max={logCleanupMode === 'by_count' ? 1000 : 3650}
                    onChange={(value) => setLogCleanupValue(value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <Text
                    strong
                    style={{
                      display: 'block',
                      marginBottom: 8,
                      visibility: 'hidden',
                    }}
                  >
                    &nbsp;
                  </Text>
                <Popconfirm
                  title={"确认清理日志文件？"}
                  content={
                    logCleanupMode === 'by_count'
                      ? `将只保留最近 ${logCleanupValue} 个日志文件，其余将被删除。`
                      : `将删除 ${logCleanupValue} 天前的日志文件。`
                  }
                  onConfirm={cleanupLogFiles}
                >
                  <Button type='danger' loading={logCleanupLoading}>
                    {"清理日志文件"}
                  </Button>
                </Popconfirm>
                </div>
              </Col>
            </Row>
          </>
        ) : (
          <Banner
            type='warning'
            description={"服务器日志功能未启用（未配置日志目录）"}
          />
        )}
      </Form.Section>

      {/* 性能统计 */}
      <Spin spinning={statsLoading}>
        <Form.Section text={"性能监控"}>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={fetchStats}>{"刷新统计"}</Button>
                <Popconfirm
                  title={"确认清理不活跃的磁盘缓存？"}
                  content={"这将删除超过 10 分钟未使用的临时缓存文件"}
                  onConfirm={clearDiskCache}
                >
                  <Button type='warning'>{"清理不活跃缓存"}</Button>
                </Popconfirm>
                <Button onClick={resetStats}>{"重置统计"}</Button>
                <Button onClick={forceGC}>{"执行 GC"}</Button>
              </div>
            </Col>
          </Row>

          {stats && (
            <>
              {/* 缓存使用情况 */}
              <Row
                gutter={16}
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'stretch',
                }}
              >
                <Col xs={24} md={12} style={{ display: 'flex' }}>
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--semi-color-fill-0)',
                      borderRadius: 8,
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Text strong style={{ marginBottom: 8, display: 'block' }}>
                      {"请求体磁盘缓存"}
                    </Text>
                    <Progress
                      percent={parseFloat(diskCacheUsagePercent)}
                      showInfo
                      style={{ marginBottom: 8 }}
                      stroke={
                        parseFloat(diskCacheUsagePercent) > 80
                          ? 'var(--semi-color-danger)'
                          : 'var(--semi-color-primary)'
                      }
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <Text type='tertiary'>
                        {formatBytes(
                          stats.cache_stats.current_disk_usage_bytes,
                        )}{' '}
                        / {formatBytes(stats.cache_stats.disk_cache_max_bytes)}
                      </Text>
                      <Text type='tertiary'>
                        {"活跃文件"}: {stats.cache_stats.active_disk_files}
                      </Text>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                      <Tag color='blue'>
                        {"磁盘命中"}: {stats.cache_stats.disk_cache_hits}
                      </Tag>
                    </div>
                  </div>
                </Col>
                <Col xs={24} md={12} style={{ display: 'flex' }}>
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--semi-color-fill-0)',
                      borderRadius: 8,
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Text strong style={{ marginBottom: 8, display: 'block' }}>
                      {"请求体内存缓存"}
                    </Text>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <Text>
                        {"当前缓存大小"}:{' '}
                        {formatBytes(
                          stats.cache_stats.current_memory_usage_bytes,
                        )}
                      </Text>
                      <Text>
                        {"活跃缓存数"}:{' '}
                        {stats.cache_stats.active_memory_buffers}
                      </Text>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                      <Tag color='green'>
                        {"内存命中"}: {stats.cache_stats.memory_cache_hits}
                      </Tag>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* 缓存目录磁盘空间 */}
              {stats.disk_space_info?.total > 0 && (
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={24}>
                    <div
                      style={{
                        padding: 16,
                        background: 'var(--semi-color-fill-0)',
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        strong
                        style={{ marginBottom: 8, display: 'block' }}
                      >
                        {"缓存目录磁盘空间"}
                      </Text>
                      <Progress
                        percent={parseFloat(
                          stats.disk_space_info.used_percent.toFixed(1),
                        )}
                        showInfo
                        style={{ marginBottom: 8 }}
                        stroke={
                          stats.disk_space_info.used_percent > 90
                            ? 'var(--semi-color-danger)'
                            : stats.disk_space_info.used_percent > 70
                              ? 'var(--semi-color-warning)'
                              : 'var(--semi-color-primary)'
                        }
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        <Text type='tertiary'>
                          {"已用"}: {formatBytes(stats.disk_space_info.used)}
                        </Text>
                        <Text type='tertiary'>
                          {"可用"}: {formatBytes(stats.disk_space_info.free)}
                        </Text>
                        <Text type='tertiary'>
                          {"总计"}:{' '}
                          {formatBytes(stats.disk_space_info.total)}
                        </Text>
                      </div>
                      {stats.disk_space_info.free <
                        inputs['performance_setting.disk_cache_max_size_mb'] *
                          1024 *
                          1024 && (
                        <Banner
                          type='warning'
                          description={"磁盘可用空间小于缓存最大总量设置"}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </div>
                  </Col>
                </Row>
              )}

              {/* 系统内存统计 */}
              <Row gutter={16}>
                <Col span={24}>
                  <Descriptions
                    data={[
                      {
                        key: "已分配内存",
                        value: formatBytes(stats.memory_stats.alloc),
                      },
                      {
                        key: "总分配内存",
                        value: formatBytes(stats.memory_stats.total_alloc),
                      },
                      {
                        key: "系统内存",
                        value: formatBytes(stats.memory_stats.sys),
                      },
                      { key: "GC 次数", value: stats.memory_stats.num_gc },
                      {
                        key: "Goroutine 数",
                        value: stats.memory_stats.num_goroutine,
                      },
                      {
                        key: "缓存目录",
                        value: stats.disk_cache_info.path,
                      },
                      {
                        key: "目录文件数",
                        value: stats.disk_cache_info.file_count,
                      },
                      {
                        key: "目录总大小",
                        value: formatBytes(stats.disk_cache_info.total_size),
                      },
                    ]}
                  />
                </Col>
              </Row>
            </>
          )}
        </Form.Section>
      </Spin>
    </>
  );
}
