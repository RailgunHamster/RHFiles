// Native macOS services, statically linked: no shell interpolation or helper download.
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>
#include <copyfile.h>

static id perform(NSDictionary *request, NSError **error) {
    NSString *action = request[@"action"];
    NSString *path = request[@"path"];
    NSFileManager *fm = NSFileManager.defaultManager;
    if ([action isEqual:@"drives"]) {
        NSMutableArray *items = [NSMutableArray array];
        NSArray *keys = @[NSURLVolumeNameKey, NSURLVolumeTotalCapacityKey, NSURLVolumeAvailableCapacityKey];
        NSMutableSet *seen = [NSMutableSet set];
        NSArray *volumes = [fm mountedVolumeURLsIncludingResourceValuesForKeys:keys options:NSVolumeEnumerationSkipHiddenVolumes];
        for (NSURL *url in volumes) {
            if ([seen containsObject:url.path]) continue;
            [seen addObject:url.path];
            NSDictionary *v = [url resourceValuesForKeys:keys error:nil];
            [items addObject:@{@"letter":url.path, @"label":v[NSURLVolumeNameKey] ?: url.lastPathComponent,
                @"fs_type":@"", @"total_bytes":v[NSURLVolumeTotalCapacityKey] ?: @0,
                @"free_bytes":v[NSURLVolumeAvailableCapacityKey] ?: @0}];
        }
        return items;
    }
    NSString *boardName = request[@"testPasteboard"];
    if (boardName && ![boardName hasPrefix:@"com.rhfiles.test."])
        @throw [NSException exceptionWithName:@"Clipboard" reason:@"Invalid test pasteboard" userInfo:nil];
    NSPasteboard *pb = boardName ? [NSPasteboard pasteboardWithName:boardName] : NSPasteboard.generalPasteboard;
    NSPasteboardType cutType = @"com.rhfiles.cut-files";
    if ([action isEqual:@"clipboard.release-test"] && boardName) { [pb releaseGlobally]; return @YES; }
    if ([action isEqual:@"clipboard.read"]) {
        NSArray *urls = [pb readObjectsForClasses:@[NSURL.class] options:@{NSPasteboardURLReadingFileURLsOnlyKey:@YES}] ?: @[];
        NSMutableArray *paths = [NSMutableArray array];
        for (NSURL *url in urls) if (url.isFileURL) [paths addObject:url.path];
        // Objective-C comparison expressions have type int, so boxing them with
        // @() serializes 0/1 instead of JSON false/true. Keep the FFI schema Boolean.
        return @{@"sequence":@(pb.changeCount), @"hasFiles":paths.count > 0 ? @YES : @NO, @"paths":paths,
                 @"cut":[[pb stringForType:cutType] isEqual:@"true"] ? @YES : @NO};
    }
    if ([action isEqual:@"clipboard.clear"]) {
        if (pb.changeCount != [request[@"sequence"] integerValue]) return @NO;
        [pb clearContents]; return @YES;
    }
    if ([action isEqual:@"clipboard.text"]) {
        NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
        [item setString:request[@"text"] ?: @"" forType:NSPasteboardTypeString];
        [pb clearContents];
        if (![pb writeObjects:@[item]]) @throw [NSException exceptionWithName:@"Clipboard" reason:@"Could not write clipboard text" userInfo:nil];
        return @YES;
    }
    if ([action isEqual:@"clipboard.write"]) {
        NSMutableArray *urls = [NSMutableArray array];
        for (NSString *entry in request[@"paths"]) {
            if (![entry isAbsolutePath]) @throw [NSException exceptionWithName:@"Path" reason:@"Absolute file paths required" userInfo:nil];
            NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
            [item setString:[NSURL fileURLWithPath:entry].absoluteString forType:NSPasteboardTypeFileURL];
            // Declare the private type on the first item before publishing.
            // NSPasteboard.stringForType concatenates values across all items.
            if (!urls.count) [item setString:[request[@"cut"] boolValue] ? @"true" : @"false" forType:cutType];
            [urls addObject:item];
        }
        [pb clearContents];
        if (![pb writeObjects:urls]) @throw [NSException exceptionWithName:@"Clipboard" reason:@"Could not write file URLs" userInfo:nil];
        return @(pb.changeCount);
    }
    if ([action isEqual:@"share"]) {
        NSMutableArray *items = [NSMutableArray array];
        for (NSString *entry in request[@"paths"]) {
            if (![entry isAbsolutePath] || ![fm fileExistsAtPath:entry])
                @throw [NSException exceptionWithName:@"Path" reason:@"Sharing requires existing absolute file paths" userInfo:nil];
            [items addObject:[NSURL fileURLWithPath:entry]];
        }
        NSView *view = NSApp.keyWindow.contentView;
        if (!view || !items.count) @throw [NSException exceptionWithName:@"Share" reason:@"No active window or selected files" userInfo:nil];
        static NSSharingServicePicker *picker;
        picker = [[NSSharingServicePicker alloc] initWithItems:items];
        [picker showRelativeToRect:NSMakeRect(NSMidX(view.bounds), NSMidY(view.bounds), 1, 1) ofView:view preferredEdge:NSRectEdgeMinY];
        return @YES;
    }
    if (![path isAbsolutePath]) @throw [NSException exceptionWithName:@"Path" reason:@"Absolute file path required" userInfo:nil];
    NSURL *url = [NSURL fileURLWithPath:path];
    if ([action isEqual:@"metadata"]) {
        NSString *target = request[@"target"];
        if (![target isAbsolutePath]) @throw [NSException exceptionWithName:@"Path" reason:@"Absolute destination required" userInfo:nil];
        if (copyfile(path.fileSystemRepresentation, target.fileSystemRepresentation, NULL, COPYFILE_METADATA | COPYFILE_NOFOLLOW) != 0) {
            *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil]; return nil;
        }
        return @YES;
    }
    if ([action isEqual:@"trash"]) {
        NSURL *result = nil;
        if (![fm trashItemAtURL:url resultingItemURL:&result error:error]) return nil;
        return result.path;
    }
    if ([action isEqual:@"rename"]) {
        NSString *target = request[@"target"];
        if (![target isAbsolutePath]) @throw [NSException exceptionWithName:@"Path" reason:@"Absolute destination required" userInfo:nil];
        if (renamex_np(path.fileSystemRepresentation, target.fileSystemRepresentation, RENAME_EXCL) != 0) {
            *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil]; return nil;
        }
        return @YES;
    }
    if ([action isEqual:@"reveal"]) { [NSWorkspace.sharedWorkspace activateFileViewerSelectingURLs:@[url]]; return @YES; }
    if ([action isEqual:@"icon"]) {
        NSInteger size = MAX(16, MIN(256, [request[@"size"] integerValue]));
        NSImage *icon = [NSWorkspace.sharedWorkspace iconForFile:path];
        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:size pixelsHigh:size bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
        [NSGraphicsContext saveGraphicsState];
        [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap]];
        [icon drawInRect:NSMakeRect(0, 0, size, size) fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1];
        [NSGraphicsContext restoreGraphicsState];
        return [[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}] base64EncodedStringWithOptions:0];
    }
    if ([action isEqual:@"open-with"]) {
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.directoryURL = [NSURL fileURLWithPath:@"/Applications"];
        panel.canChooseDirectories = NO; panel.allowsMultipleSelection = NO;
        panel.allowedContentTypes = @[UTTypeApplicationBundle]; panel.prompt = @"Open / 打开";
        if ([panel runModal] != NSModalResponseOK) return NSNull.null;
        // Rust invokes /usr/bin/open with separate arguments and reports launch errors.
        return panel.URL.path;
    }
    if ([action isEqual:@"wallpaper"]) {
        for (NSScreen *screen in NSScreen.screens)
            if (![NSWorkspace.sharedWorkspace setDesktopImageURL:url forScreen:screen options:@{} error:error]) return nil;
        return @YES;
    }
    @throw [NSException exceptionWithName:@"Action" reason:@"Unsupported macOS service" userInfo:nil];
}

char *rhfiles_macos_request(const char *input) {
    __block char *result = NULL;
    void (^work)(void) = ^{
        @autoreleasepool {
            NSDictionary *envelope;
            @try {
                NSError *error = nil;
                NSData *data = [[NSString stringWithUTF8String:input] dataUsingEncoding:NSUTF8StringEncoding];
                NSDictionary *request = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
                id value = request ? perform(request, &error) : nil;
                envelope = error ? @{@"error":error.localizedDescription} : @{@"value":value ?: NSNull.null};
            } @catch (NSException *e) { envelope = @{@"error":e.reason ?: @"macOS service failed"}; }
            NSData *json = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:nil];
            result = strdup([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        }
    };
    // Filesystem calls must also work in headless tests, without a GUI run loop.
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:input length:strlen(input)] options:0 error:nil];
    BOOL gui = [@[@"icon", @"reveal", @"open-with", @"wallpaper", @"share"] containsObject:request[@"action"]];
    if (!gui || NSThread.isMainThread) work(); else dispatch_sync(dispatch_get_main_queue(), work);
    return result;
}
void rhfiles_macos_free(char *value) { free(value); }
