import React from "react";
import { Card, Typography, Avatar } from "@douyinfe/semi-ui";
import { Languages } from "lucide-react";

const PreferencesSettings = ({ t }) => {
	return (
		<Card className="!rounded-2xl shadow-sm border-0">
			{/* Card Header */}
			<div className="flex items-center mb-4">
				<Avatar size="small" color="violet" className="mr-3 shadow-md">
					<Languages size={16} />
				</Avatar>
				<div>
					<Typography.Text className="text-lg font-medium">
						{"偏好设置"}
					</Typography.Text>
					<div className="text-xs text-gray-600 dark:text-gray-400">
						{"界面语言和其他个人偏好"}
					</div>
				</div>
			</div>
			{/* Language Setting Card */}
			<Card className="!rounded-xl border dark:border-gray-700">
				<div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
					<div className="flex items-start w-full sm:w-auto">
						<div className="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mr-4 flex-shrink-0">
							<Languages
								size={20}
								className="text-violet-600 dark:text-violet-400"
							/>
						</div>
						<div>
							<Typography.Title heading={6} className="mb-1">
							{"界面语言"}
							</Typography.Title>
							<Typography.Text type="tertiary" className="text-sm">
							{"当前版本固定为简体中文"}
							</Typography.Text>
						</div>
					</div>
					<div className="px-3 py-2 rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
						简体中文
					</div>
				</div>
			</Card>

			{/* Additional info */}
			<div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
				<Typography.Text type="tertiary">
					{"提示：当前不支持切换语言，界面统一使用简体中文。"}
				</Typography.Text>
			</div>
		</Card>
	);
};

export default PreferencesSettings;
