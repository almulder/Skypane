"""Forgot the Manager's password and no other admin can help? Run in the Unraid terminal:

    docker exec -it skypane python service/reset_login.py               (the owner)
    docker exec -it skypane python service/reset_login.py --user NAME   (any login: another admin, a user)

It clears only that login's password: the names, the other logins and every setting, device choice and picture stay.
Then it asks for the new password right there (type it twice), or — press Enter, or run it without -it — it prints a
one-time code: open http://<Skypane's IP>/admin, choose "I have a sign-in code" and type the login's name, the code
and the new password (the code works once, for an hour). (Usually another admin can do this from Manager → Accounts:
"Make a sign-in code".)

This only runs in the terminal (inside the container): nothing on the network can start it.
"""
import getpass
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import manager_auth  # noqa: E402


def manager_url(env=None):
    """The Manager's address as the person types it: the port only when it isn't 80 (Docker: :8088; Unraid br0: none)."""
    port = str((env if env is not None else os.environ).get("PORT") or "8088").strip()
    return f"http://<Skypane's IP>{'' if port == '80' else ':' + port}/admin"


def main(data=None, ask=None, out=print, argv=None):
    data = pathlib.Path(data or os.environ.get("DATA_DIR") or pathlib.Path(__file__).resolve().parent.parent / "data")
    argv = list(argv or [])
    user = None
    if argv[:1] == ["--user"] and len(argv) == 2:
        user = argv[1]
    elif argv:
        out("Usage: python service/reset_login.py [--user NAME]   (no name: the owner)")
        return 2
    auth = manager_auth.ManagerAuth(data / "private")
    if user is not None and auth.exists() and not auth.caller(user):
        out(f"There is no login called {user!r}.")
        return 2
    try:
        name, code = auth.reset_admin_password(user=user)
    except manager_auth.Damaged:
        out(f"The accounts file ({data / 'private' / manager_auth.USERS}) can't be read. Fix it from a backup, or remove "
            "it to start over (every Manager login goes; the other settings stay).")
        return 2
    if not name:
        out(f"There is no Manager login yet. Open {manager_url()} to create the admin login.")
        return 0
    who = auth.caller(name)
    role = who.role if who else "admin"
    out(f"The password of {name!r} is cleared (the name, the other logins and the settings are kept).")
    if ask is None and sys.stdin.isatty():
        ask = getpass.getpass
    if ask:
        for _ in range(3):
            pw = ask(f"New password for {name!r} ({manager_auth.MIN_PASSWORD[role]}+ characters; Enter = use a code instead): ")
            if not pw:
                break
            if ask("The same again: ") != pw:
                out("They don't match — try again.")
                continue
            ok, why = auth.set_admin_password_here(pw, user=name)
            if ok:
                out(f"Done: sign in at {manager_url()} as {name!r} with the new password.")
                return 0
            out(f"Not accepted ({why}) — try again.")
    out(f"Or open {manager_url()}, choose \"I have a sign-in code\", type the name {name!r} and this code "
        f"(works once, for {manager_auth.CODE_TTL // 60} minutes):\n\n    {code}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(argv=sys.argv[1:]))
