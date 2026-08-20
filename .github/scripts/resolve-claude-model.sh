#!/usr/bin/env bash

dispatch_model=$1
prompt=$2
model=${dispatch_model}

if [[ -z ${model} ]]; then
	case "${prompt}" in
	*"[model:"*"]"*)
		model=${prompt#*\[model:}
		model=${model%%\]*}
		;;
	*) model=opus ;;
	esac
fi

model=${model//$'\r'/}
model=${model//$'\n'/}

case "${model}" in
fable | fable-5 | claude-fable-5) printf '%s\n' claude-fable-5 ;;
opus | opus-4 | opus-4.8 | claude-opus-4-8 | "") printf '%s\n' claude-opus-4-8 ;;
sonnet | sonnet-4 | sonnet-4.6 | claude-sonnet-4-6) printf '%s\n' claude-sonnet-4-6 ;;
haiku | haiku-4 | haiku-4.5) printf '%s\n' claude-haiku-4-5-20251001 ;;
*) printf '%s\n' "${model}" ;;
esac
