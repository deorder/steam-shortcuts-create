import fs from 'fs';
import util from 'util';
import path from 'path';

import commander from 'commander';

import vdf from '@node-steam/vdf';
import binary_vdf from 'binary-vdf';

import create_desktop_shortcut from 'create-desktop-shortcuts';

const program = new commander.Command();

program.version("1.0");

program
  .option('-l, --steam-library-dir [path]', 'Steam library path')
  .option('-o, --output-dir [path]', 'Shortcut output path', path.join(process.cwd(), 'shortcuts'));
  
program.parse(process.argv);

async function main(program) {
  const shortcuts_dir = path.resolve(program.outputDir);
  const steamapps_dir = path.join(program.steamLibraryDir, 'steamapps');
  const steamapps_common_dir = path.join(steamapps_dir, 'common');

  const appinfo_stream = fs.createReadStream('C:\\Program Files (x86)\\Steam\\appcache\\appinfo.vdf');
  const appsinfo = (await binary_vdf.readAppInfo(appinfo_stream)).reduce((r, x) => (Object.assign(r, {[x.id]: x})), {});
  
  const dir = await fs.promises.opendir(steamapps_dir);
  for await (const entry of dir) {
    const ext = path.extname(entry.name);
    const basename = path.basename(entry.name, ext);
    if(ext === '.acf') {
      const content = await fs.promises.readFile(path.join(steamapps_dir, entry.name));
      const data = vdf.parse(String(content));

      const appstate = data.AppState;
      const title = appstate.name;
      const appid = appstate.appid;
      const installdir = appstate.installdir;

      const appinfo = appsinfo[appid];
      const config = appinfo.entries.config;

      const installdir_absolute = path.join(steamapps_common_dir, installdir);

      if(config.launch) {
        const launch = Object.values(config.launch).filter((x) => {
          if(x.config) {
            const config = x.config;
            if(config.oslist) {
              if(config.oslist == 'windows') {
                if(config.osarch) {
                  if(config.osarch == '64') {
                  } else {
                    return false;
                  }
                }
              } else {
                return false;
              }
            }
          }
          return true;  
        })[0];

        const launch_dir = installdir_absolute;
        const launch_executable = launch.executable;
        const launch_arguments = launch.arguments || '';
        const launch_path = path.join(launch_dir, launch_executable);

        console.log(`Creating launcher for ${title} (${appid}) to ${launch.executable}`);

        try {
          const result = create_desktop_shortcut({
            verbose: true,
            onlyCurrentOS: true,
            customLogger: function(message, error) {
              if(message) {
                console.log(message);
              }
              if(error) {
                console.error(error);
              }
            },
            'windows': {
              'windowMode': 'maximized',
              'outputPath': shortcuts_dir,
              'filePath': launch_path,
              'arguments': launch_arguments,
              'name': title.replace(/[^a-z0-9 ]/gi,'')
            }
          });
        } catch (error) {
          console.error(error);
        }
      } else {
        console.log(`No launcher for ${title} (${appid})`);
      }
    }
  }
}

main(program).catch(e => console.error(e));
