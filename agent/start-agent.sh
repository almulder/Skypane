#!/system/bin/sh
# (Re)starts panel-agent as a detached root process. Run as root:
#   su 0 sh /data/adb/panel-agent/start-agent.sh
# Called at boot by the Panel Agent Boot app (optional, not shipped yet), or run again by hand after a reboot.
# (v3.0.5) A new build (the self-update keeps the one before as panel-agent.old) that exits within 10 s of starting
# is put aside as panel-agent.bad and panel-agent.old is started instead; the log says so.
# The agent reads its settings from agent.args itself (-args; one line, e.g. -broker=tcp://192.168.1.50:1883) and
# rewrites it when the panel page configures it (POST 127.0.0.1:852/config); empty or missing is fine. Nothing from
# agent.args is put on the command line, so the MQTT login never shows up in ps.
DIR=/data/adb/panel-agent
BIN=$DIR/panel-agent
LOG=$DIR/panel-agent.log

chmod 755 $BIN   # adb push of a new build resets the mode
pkill -x panel-agent 2>/dev/null   # exact process name: -f would also match shells mentioning the path
sleep 1
# keep the last log around for troubleshooting
[ -f $LOG ] && mv $LOG $LOG.old

# When started from the boot app, this shell sits in the app's cgroup (uid_<app>/pid_<n>) and
# Android kills that whole group when it reclaims the app. Move the agent to the root cgroup first.
start() {
    setsid sh -c 'echo $$ > /sys/fs/cgroup/cgroup.procs; exec "$0" "$@"' "$BIN" -args "$DIR/agent.args" >> $LOG 2>&1 < /dev/null &
}
# (v3.0.5) still running 10 s after the start? Else back to the build before it, once.
alive10() {
    i=0
    while [ $i -lt 10 ]; do
        sleep 1
        pgrep -x panel-agent > /dev/null || return 1
        i=$((i + 1))
    done
    return 0
}
start
if ! alive10 && [ -f $BIN.old ] && [ ! -L $BIN.old ]; then
    echo "start-agent: the new build exited within 10 s; going back to panel-agent.old (the new one is kept as panel-agent.bad)" | tee -a $LOG
    mv -f $BIN $BIN.bad && mv -f $BIN.old $BIN && chmod 755 $BIN
    start
    sleep 2
fi
if pgrep -x panel-agent > /dev/null; then
    echo "panel-agent running (pid $(pgrep -x panel-agent))"
else
    echo "panel-agent failed to start:"; cat $LOG
    exit 1
fi
