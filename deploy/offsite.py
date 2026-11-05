#!/usr/bin/env python3
"""Private encrypted backup replication. Credentials stay in a root-only JSON file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT=Path('/opt/teamfare/backups')
COMPOSE=['docker','compose','--project-name','teamfare','--env-file','/opt/teamfare/shared/production.env','-f','compose.yaml','-f','deploy/compose.production.yaml','exec','-T','teamfare','node','server/archive.ts']

def archive(config,operation,source,destination):
    request={'operation':operation,'source':'/backups/'+source.name,'destination':'/backups/'+destination.name,'key':config['encryption_key']}
    process=subprocess.run(COMPOSE,input=json.dumps(request),text=True,capture_output=True,cwd='/opt/teamfare/current',timeout=120)
    if process.returncode: raise RuntimeError('Backup archive encryption or verification failed')

def checksum(path):
    digest=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''): digest.update(chunk)
    return digest.hexdigest()

def save_status(success,error=None):
    path=ROOT/'offsite-status.json'
    previous={}
    if path.exists():
        try: previous=json.loads(path.read_text())
        except (ValueError,OSError): pass
    now=datetime.now(timezone.utc).isoformat()
    previous.update({'lastAttemptAt':now,'error':error})
    if success: previous['lastSuccessAt']=now
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(previous));temporary.chmod(0o644);temporary.replace(path)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('snapshot');parser.add_argument('--config',default='/opt/teamfare/shared/backup-config.json');args=parser.parse_args()
    config=json.loads(Path(args.config).read_text())
    endpoint=config['endpoint'];bucket=config['bucket'];prefix='teamfare/'
    if not re.fullmatch(r'https://[a-z0-9-]+\.vultrobjects\.com',endpoint) or not re.fullmatch(r'teamfare-backups-[a-z0-9-]{8,40}',bucket): raise RuntimeError('Unexpected backup destination')
    source=Path(args.snapshot).resolve()
    if source.parent!=ROOT or not re.fullmatch(r'teamfare-[0-9TZ]+\.sqlite',source.name): raise RuntimeError('Unexpected snapshot path')
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    client=boto3.client('s3',endpoint_url=endpoint,aws_access_key_id=config['access_key'],aws_secret_access_key=config['secret_key'],region_name='us-east-1',config=Config(signature_version='s3v4',connect_timeout=10,read_timeout=60,retries={'max_attempts':3},s3={'addressing_style':'path'}))
    try: client.head_bucket(Bucket=bucket)
    except ClientError as error:
        if error.response['Error']['Code'] not in ['404','NoSuchBucket','NotFound']: raise
        client.create_bucket(Bucket=bucket,ACL='private')
    client.put_bucket_acl(Bucket=bucket,ACL='private')
    grants=client.get_bucket_acl(Bucket=bucket)['Grants']
    if any(g.get('Grantee',{}).get('URI') for g in grants): raise RuntimeError('Backup bucket has a public grant')
    # Keep a week of immediately accessible copies; expire this dedicated prefix at 30 days.
    client.put_bucket_lifecycle_configuration(Bucket=bucket,LifecycleConfiguration={'Rules':[{'ID':'teamfare-retention','Filter':{'Prefix':prefix},'Status':'Enabled','Transitions':[{'Days':7,'StorageClass':'VULTR_ARCHIVE'}],'Expiration':{'Days':30}}]})
    encrypted=source.with_suffix('.sqlite.enc')
    if encrypted.exists(): encrypted.unlink()
    archive(config,'encrypt',source,encrypted)
    key=prefix+encrypted.name
    try:
        client.upload_file(str(encrypted),bucket,key,ExtraArgs={'ACL':'private','ContentType':'application/octet-stream','Metadata':{'sha256':checksum(encrypted)}})
        public_url=endpoint+'/'+bucket+'/'+urllib.parse.quote(key,safe='/')
        try:
            with urllib.request.urlopen(urllib.request.Request(public_url,method='HEAD'),timeout=15): raise RuntimeError('Backup object is publicly accessible')
        except urllib.error.HTTPError as error:
            if error.code not in [401,403]: raise
        with tempfile.TemporaryDirectory(prefix='.offsite-verify-',dir=ROOT) as folder:
            folder=Path(folder);downloaded=folder/'download.enc';restored=folder/'restore.sqlite'
            # The app container sees the same host backup directory.
            client.download_file(bucket,key,str(downloaded))
            if checksum(downloaded)!=checksum(encrypted): raise RuntimeError('Offsite checksum mismatch')
            os.chmod(folder,0o700);os.chown(folder,1000,1000);os.chmod(downloaded,0o600);os.chown(downloaded,1000,1000)
            request={'operation':'decrypt','source':'/backups/'+str(downloaded.relative_to(ROOT)),'destination':'/backups/'+str(restored.relative_to(ROOT)),'key':config['encryption_key']}
            process=subprocess.run(COMPOSE,input=json.dumps(request),text=True,capture_output=True,cwd='/opt/teamfare/current',timeout=120)
            if process.returncode: raise RuntimeError('Offsite restore decryption failed')
            with sqlite3.connect('file:'+str(restored)+'?mode=ro',uri=True) as db:
                if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall(): raise RuntimeError('Offsite restore integrity failed')
        save_status(True)
        print('Encrypted offsite backup uploaded, private access verified, downloaded and restored successfully.')
    finally:
        encrypted.unlink(missing_ok=True)

if __name__=='__main__':
    os.umask(0o077)
    try: main()
    except Exception as error:
        # SDK exceptions can include request metadata; only retain the exception category.
        save_status(False,'Offsite backup failed ('+type(error).__name__+'). Check the backup service logs/configuration.')
        print('Encrypted offsite backup failed. Check private storage configuration and provider status.',file=__import__('sys').stderr)
        raise SystemExit(1)
