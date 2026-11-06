#!/system/bin/sh
# Installs/updates panel-agent from /data/local/tmp into /data/adb/panel-agent and (re)starts it. Run as root.
# Push first: panel-agent, start-agent.sh, agent.args (optional) to /data/local/tmp.
# Symlinks are refused (source, target and the directory), so nothing can redirect the mv/chmod as root.
SRC=/data/local/tmp
DIR=/data/adb/panel-agent

[ -L $DIR ] && { echo "refused: $DIR is a symlink"; exit 1; }
mkdir -p $DIR && chmod 700 $DIR
for f in panel-agent start-agent.sh agent.args agent.token agent.server agent.key configured-by; do
    [ -L $SRC/$f ] && { echo "refused: $SRC/$f is a symlink"; exit 1; }
    [ -L $DIR/$f ] && { echo "refused: $DIR/$f is a symlink"; exit 1; }
done
for f in panel-agent start-agent.sh agent.args; do
    [ -f "$SRC/$f" ] || continue
    mv "$SRC/$f" "$DIR/$f" || exit 1
    # re-check after the move (a file swapped for a symlink in between is removed, never followed)
    [ -L "$DIR/$f" ] && { rm -f "$DIR/$f"; echo "refused: $DIR/$f became a symlink (removed)"; exit 1; }
    chown 0:0 "$DIR/$f" || exit 1
done
chmod 755 $DIR/panel-agent
chmod 644 $DIR/start-agent.sh
for f in agent.args agent.token agent.server agent.key configured-by; do   # the MQTT login, the agent token, (v3.0.5) the paired server and its key
    [ -f $DIR/$f ] && chmod 600 $DIR/$f
done

# clean up earlier test files (Android expects /data/local/tmp to stay empty)
rm -f $SRC/panel-agent.log* $SRC/ledctl $SRC/*.sh
pkill -x panel-agent 2>/dev/null

ls -la $DIR
sh $DIR/start-agent.sh || exit 1
echo "cgroup: $(cat /proc/$(pgrep -x panel-agent)/cgroup)"
