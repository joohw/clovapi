package apply

func init() {
	Register(claudeCodeTarget{})
	Register(claudeDesktopTarget{})
	Register(codexTarget{})
	Register(openCodeTarget{})
	Register(openClawTarget{})
	Register(hermesTarget{})
	Register(kimiTarget{})
}
