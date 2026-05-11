package apply

func init() {
	Register(claudeCodeTarget{})
	Register(codexTarget{})
	Register(openCodeTarget{})
	Register(openClawTarget{})
	Register(hermesTarget{})
	Register(kimiTarget{})
}
