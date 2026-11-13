#!/usr/bin/env python3
"""Build a local IPv4/IPv6 country index from DB-IP Lite (CC BY 4.0)."""
import argparse, csv, datetime, gzip, hashlib, io, ipaddress, json, os, re, struct, tempfile
from pathlib import Path
from urllib.request import Request, urlopen

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--directory',default='/opt/fikus-miniapp/shared/data/geoip');parser.add_argument('--month',default=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m'));parser.add_argument('--force',action='store_true');args=parser.parse_args()
    if not re.fullmatch(r'20\d\d-(0[1-9]|1[0-2])',args.month):raise ValueError('Invalid release month')
    directory=Path(args.directory);directory.mkdir(parents=True,exist_ok=True);target=directory/'country.bin';meta=directory/'country.bin.json'
    if not args.force and target.exists() and meta.exists() and json.loads(meta.read_text()).get('release')==args.month:
        print('Country database already current:',args.month);return
    url=f'https://download.db-ip.com/free/dbip-country-lite-{args.month}.csv.gz';rows={4:[],6:[]};source_rows=0
    with urlopen(Request(url,headers={'User-Agent':'fiKUS-country-index/1.0'}),timeout=90) as response:
        for start,end,country in csv.reader(io.TextIOWrapper(gzip.GzipFile(fileobj=response),encoding='utf-8')):
            a,b=ipaddress.ip_address(start),ipaddress.ip_address(end)
            if a.version!=b.version or int(a)>int(b) or not re.fullmatch('[A-Z]{2}',country):raise ValueError('Invalid country range')
            rows[a.version].append((int(a),int(b),country));source_rows+=1
    if source_rows<100000:raise ValueError('Incomplete country database')
    for family in rows:
        merged=[]
        for start,end,country in sorted(rows[family]):
            if merged and start<=merged[-1][1]:raise ValueError('Overlapping country ranges')
            if merged and start==merged[-1][1]+1 and country==merged[-1][2]:merged[-1]=(merged[-1][0],end,country)
            else:merged.append((start,end,country))
        rows[family]=merged
    tmp=None
    try:
        with tempfile.NamedTemporaryFile(dir=directory,delete=False) as f:
            tmp=Path(f.name);f.write(b'FIKGEO1\n'+struct.pack('>II',len(rows[4]),len(rows[6])))
            for family,width in [(4,4),(6,16)]:
                for start,end,country in rows[family]:f.write(start.to_bytes(width,'big')+end.to_bytes(width,'big')+country.encode('ascii'))
            f.flush();os.fsync(f.fileno())
        tmp.chmod(0o644);os.replace(tmp,target)
        metadata={'release':args.month,'source':url,'license':'CC BY 4.0','attribution':'IP Geolocation by DB-IP https://db-ip.com/','sourceRows':source_rows,'ipv4Ranges':len(rows[4]),'ipv6Ranges':len(rows[6]),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        metadata_tmp=directory/'country.bin.json.next';metadata_tmp.write_text(json.dumps(metadata,indent=2)+'\n');metadata_tmp.chmod(0o644);os.replace(metadata_tmp,meta)
        print(json.dumps(metadata))
    finally:
        if tmp and tmp.exists():tmp.unlink()

if __name__=='__main__':main()
