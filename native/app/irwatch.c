/* Passive Home watcher for the basic IR remote ("LGE RCU"), which has no writable
   twin device for relay.c to forward through. Never grabs the device: LG still
   handles every key, and this only reports short Home presses so the controller
   can bring the launcher back on top. Prints HOME (short) or LONG (held >= 2 s; LG uses long Home for zoom). */
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>
#define NAME(len) _IOC(_IOC_READ,'E',0x06,len)
#define HOME_KEY 773
#define LONG_MS 2000
struct ev {uint32_t sec,usec;uint16_t type,code;int32_t value;};
static volatile sig_atomic_t stop=0;
static void stopped(int s){(void)s;stop=1;}
static uint64_t ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static int find_device(const char*wanted){for(int i=0;i<32;i++){char p[64],name[256]={0};snprintf(p,sizeof p,"/dev/input/event%d",i);int fd=open(p,O_RDONLY|O_NONBLOCK|O_CLOEXEC);if(fd<0)continue;if(ioctl(fd,NAME(sizeof name),name)>=0&&!strcmp(name,wanted)){printf("DEVICE %s %s\n",p,name);return fd;}close(fd);}return -1;}
int main(void){
 setvbuf(stdout,NULL,_IOLBF,0);signal(SIGPIPE,SIG_IGN);signal(SIGTERM,stopped);signal(SIGINT,stopped);
 int in=find_device("LGE RCU");if(in<0){puts("FAIL no-ir-remote");return 10;}
 puts("READY");
 /* stdin closes when the controller exits, so the watcher never outlives it. */
 struct pollfd p[2]={{in,POLLIN,0},{0,POLLIN,0}};uint64_t down=0;
 while(!stop){
  int r=poll(p,2,500);if(r<0){if(errno==EINTR)continue;return 11;}
  if(p[1].revents&(POLLIN|POLLHUP|POLLERR)){char b[64];if(read(0,b,sizeof b)<=0)break;}
  if(p[0].revents&(POLLHUP|POLLERR))return 12;
  if(!(p[0].revents&POLLIN))continue;
  struct ev e[64];ssize_t n=read(in,e,sizeof e);if(n<0&&errno==EAGAIN)continue;if(n<=0)return 13;
  for(int i=0;i<n/(int)sizeof e[0];i++){
   if(e[i].type!=1||e[i].code!=HOME_KEY)continue;
   if(e[i].value==1&&!down)down=ms();
   else if(e[i].value==0&&down){puts(ms()-down>=LONG_MS?"LONG":"HOME");down=0;}
  }
 }
 close(in);return 0;
}
