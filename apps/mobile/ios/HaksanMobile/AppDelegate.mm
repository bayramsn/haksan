#import "AppDelegate.h"
#import <BackgroundTasks/BackgroundTasks.h>
#import <React/RCTBundleURLProvider.h>

static NSString *const HaksanCalendarRefreshIdentifier = @"com.haksan.mobile.calendar-refresh";

static void HaksanScheduleNextCalendarRefresh(void)
{
  BGAppRefreshTaskRequest *request = [[BGAppRefreshTaskRequest alloc] initWithIdentifier:HaksanCalendarRefreshIdentifier];
  request.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:15 * 60];
  [[BGTaskScheduler sharedScheduler] submitTaskRequest:request error:nil];
}

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"HaksanMobile";
  self.initialProps = @{};
  [[BGTaskScheduler sharedScheduler] registerForTaskWithIdentifier:HaksanCalendarRefreshIdentifier
                                                       usingQueue:nil
                                                    launchHandler:^(__kindof BGTask *task) {
    HaksanScheduleNextCalendarRefresh();
    [[NSNotificationCenter defaultCenter] postNotificationName:@"HaksanCalendarBackgroundSync" object:nil];
    __block BOOL completed = NO;
    task.expirationHandler = ^{
      if (!completed) {
        completed = YES;
        [task setTaskCompletedWithSuccess:NO];
      }
    };
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(25 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (!completed) {
        completed = YES;
        [task setTaskCompletedWithSuccess:YES];
      }
    });
  }];
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
