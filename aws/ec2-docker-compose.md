# AWS EC2 + Docker Compose Walkthrough
> Manual deployment · Ubuntu 22.04 · t2.micro · Free Tier

---

## Prerequisites

- AWS account with free tier active
- A working `docker-compose.yml` in your project
- SSH client (built into macOS/Linux; use Windows Terminal on Windows)
- Your project in a Git repo (or ready to SCP up)

---

## Step 1 — Launch a t2.micro Instance

Go to **EC2 → Instances → Launch Instance** in the AWS Console.

| Setting | Value |
|---|---|
| Name | anything |
| AMI | Ubuntu Server 22.04 LTS |
| Instance Type | t2.micro *(Free tier eligible)* |
| Key Pair | Create new → download `.pem` |

> ⚠️ Save the `.pem` file somewhere safe. You cannot re-download it.

### Security Group — set these ports

| Type | Port | Source |
|---|---|---|
| SSH | 22 | My IP |
| HTTP | 80 | Anywhere |
| Custom TCP | 8000 (or your app port) | Anywhere |

Leave storage at the default 8 GB (you get up to 30 GB free).

Click **Launch Instance** and wait for *2/2 checks passed*.

---

## Step 2 — SSH Into the Instance

Get the **Public IPv4 DNS** from the instance detail panel.

```bash
# Fix .pem permissions (macOS/Linux — required)
chmod 400 ~/Downloads/my-key.pem

# Connect
ssh -i ~/Downloads/my-key.pem ubuntu@ec2-xx-xx-xx-xx.compute-1.amazonaws.com
```

> ⚠️ The default user is `ubuntu` for Ubuntu AMIs — not `ec2-user`, not `root`.

You're in when you see a prompt like `ubuntu@ip-172-xx-xx-xx:~$`.

**Most common failure here:** SSH port 22 not open in your security group, or wrong source IP. Go back to EC2 → Security Groups and verify.

---

## Step 3 — Install Docker + Compose Plugin

Run these inside your SSH session:

```bash
# Update apt and install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl

# Add Docker's GPG key and repo
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
| sudo tee /etc/apt/sources.list.d/docker.list

# Install Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow ubuntu user to run docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker
```

Verify it worked:

```bash
docker --version
docker compose version   # note: no hyphen (v2 plugin)
```

> 💡 `docker compose` (space) is the v2 plugin — that's what's installed above. The old `docker-compose` (hyphen) is v1 and no longer maintained.

---

## Step 4 — Get Your Project onto the Instance

**Option A — Clone from Git (recommended)**

```bash
git clone https://github.com/yourname/your-repo.git
cd your-repo
```

**Option B — SCP from your local machine**

```bash
# Run this on your LOCAL machine, not on EC2
scp -i ~/Downloads/my-key.pem -r ./your-project ubuntu@ec2-xx-xx-xx-xx.compute-1.amazonaws.com:~/
```

Git is cleaner for iteration — `git pull` to deploy updates instead of re-uploading files.

---

## Step 5 — Handle Environment Variables

If your Compose file uses a `.env` file, create it directly on the instance. Don't put secrets in your repo.

```bash
# Create a .env in your project directory on EC2
nano .env

# Paste in your variables, e.g.:
DATABASE_URL=postgres://user:pass@db:5432/mydb
SECRET_KEY=your-secret-here
```

Make sure `.env` is in your `.gitignore`. The file lives only on the server.

---

## Step 6 — Start Your Stack

```bash
# First run: build and start in foreground to see logs
docker compose up --build

# Once it looks healthy, Ctrl+C then start detached
docker compose up -d --build
```

Useful commands while debugging:

```bash
docker compose ps                # status of all services
docker compose logs -f           # follow all logs
docker compose logs -f api       # follow logs for one service
docker compose exec api bash     # shell inside a running container
```

Hit your EC2 public IP in a browser. If it doesn't load, check your security group ports first.

---

## Step 7 — Survive Reboots

Add `restart: always` to each service in your Compose file, then enable Docker to start on boot:

```yaml
# In docker-compose.yml
services:
  api:
    restart: always   # add this to each service
```

```bash
# On the EC2 instance
sudo systemctl enable docker
```

Test it:

```bash
sudo reboot

# Wait ~30 seconds, SSH back in, then:
docker compose ps
```

---

## Step 8 — Deploying Updates

```bash
# SSH in, go to your project directory, then:
git pull
docker compose up -d --build
```

Named volumes and bind mounts survive `--build`. Your data is safe unless you explicitly run `docker compose down -v`.

---

## Launch Checklist

- [ ] Security group has ports 22, 80, and your app port open
- [ ] `docker compose ps` shows all services as `Up`
- [ ] App accessible via EC2 public IP in browser
- [ ] `restart: always` set on all services
- [ ] `sudo systemctl enable docker` run
- [ ] `.env` is in `.gitignore`
- [ ] Rebooted and confirmed stack came back up automatically